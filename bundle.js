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
var font = { font: "20px Helvetica", fill: "#ED1C24", align: "center", boundsAlignH: "center", boundsAlignV: "middle" };

module.exports = font;

},{}],4:[function(require,module,exports){
var Players = function(game) {
    var players = [{
      name: 'Orange',
      color: 'orange',
      gamepad: game.input.gamepad.pad1,
      position: {
        x: 72, y: 44
      },
      keys: {
        up: 'W', down: 'S', left: 'A', right: 'D', attack: 'Q'
      },
    }, {
      name: 'Yellow',
      color: 'yellow',
      gamepad: game.input.gamepad.pad2,
      position: {
        x: 248, y: 44
      },
      orientation: 'left',
    }, {
      name: 'Pink',
      color: 'pink',
      gamepad: game.input.gamepad.pad3,
      position: {
        x: 72, y: 136
      },
      keys: {
        up: 'I', down: 'K', left: 'J', right: 'L', attack: 'U'
      },
    }, {
      name: 'Purple',
      color: 'purple',
      gamepad: game.input.gamepad.pad4,
      position: {
        x: 248, y: 136
      },
      orientation: 'left',
      keys: {
        up: 'T', down: 'G', left: 'F', right: 'H', attack: 'R'
      },
  }];
  
  return players;
};

module.exports = Players;

},{}],5:[function(require,module,exports){
var stages = require('./stages');

var settings = {
  playerCount: {
    options: [2, 3, 4],
    selected: 4,
  },
  bgm: {
    options: ['A', 'B', 'None'],
    selected: 'None',
  },
  stage: {
    options: stages.map(function(stage) {
      return stage.name;
    }),
    selected: 'Alpha C',
  }
};

module.exports = settings;

},{"./stages":6}],6:[function(require,module,exports){
var stages = [{
  name: 'Alpha C',
  backgroundColor: '#4DD8FF',
  platforms: {
    positions: [[48, 64], [224, 64], [136, 104], [48, 154,], [224, 154]],
    color: 'clear'
  },
  backgrounds: [{
    image: 'suns'
  },{
    image: 'clouds',
    scrolling: true,
  },{
    image: 'ground'
  }],
  foreground: 'foreground'
}, {
  name: 'Atari',
  backgroundColor: '#000',
  platforms: {
    positions: [[48, 64], [224, 64], [136, 104], [48, 154,], [224, 154]],
    color: 'blue'
  },
  backgrounds: [],
  foreground: 'clear'
}, {
  name: 'Void',
  backgroundColor: '#000',
  platforms: {
    positions: [],
    color: 'clear'
  },
  backgrounds: [],
  foreground: 'clear'
}];

module.exports = stages;

},{}],7:[function(require,module,exports){
var resize = function resize() {
  document.body.style.zoom = window.innerWidth / game.width;
};

var main = {
  preload: function preload() {
    var utils = require('./utils.js');

    resize();
    window.onresize = utils.debounce(resize, 100);
    
    // allow anything up to height of world to fall off-screen up or down
    game.world.setBounds(0, -game.width, game.width, game.height * 3);
    
    // prevent game pausing when it loses focus
    game.stage.disableVisibilityChange = true;
    
    // assets used in splash screen intro animation
    game.load.image('purple', 'images/purple.png');
  },

  create: function create() {
    game.input.gamepad.start();

    game.state.add('splash', require('./states/splash.js')(game));
    game.state.add('play', require('./states/play.js')(game));

    game.state.start('splash');
  }
};

var game = new Phaser.Game(320, 180, Phaser.AUTO, 'game', {
  preload: main.preload,
  create: main.create
}, false, false); // disable anti-aliasing

game.state.add('main', main);
game.state.start('main');

},{"./states/play.js":12,"./states/splash.js":13,"./utils.js":14}],8:[function(require,module,exports){
var buildMenu = function buildMenu(game, restart) {
  var itemHeight = 20;
  var gamepad = game.input.gamepad.pad1;
  var settings = require('./data/settings.js');
  var fontHighlight = require('./data/font.js');
  var fontNormal = Object.assign({}, fontHighlight, {fill: '#777'});

  var title = game.add.text(0, -itemHeight, 'OPTIONS', fontHighlight);
  title.setTextBounds(0, 0, game.width, game.height);

  var selectFirstItem = function selectFirstItem() {
    var selectedIndex = getSelectedIndex();
    if (selectedIndex !== 0) {
      menu[selectedIndex].selected = false;
      menu[0].selected = true;
      renderMenu();
    }
  };

  var selectStart = function selectStart() {
    var startIndex = menu.length - 1;
    var selectedIndex = getSelectedIndex();
    if (selectedIndex !== startIndex) {
      menu[selectedIndex].selected = false;
      menu[startIndex].selected = true;
      renderMenu();
    }
  };

  var toggleMenu = function toggleMenu() {
    menu.forEach(function(item) {
      if (menu.isOpen) {
        item.text.visible = false;
      } else {
        item.text.visible = true;
        selectStart();
      }
    });

    title.visible = menu.isOpen = !menu.isOpen;
  };

  var getSelectedIndex = function getSelectedIndex() {
    return menu.reduce(function(acc, item, i) {
      if (item.selected) {
        return i;
      } else {
        return acc;
      }
    }, 0);
  };

  var getSelectedItem = function getSelectedItem() {
    return menu.reduce(function(acc, item) {
      if (item.selected) {
        return item;
      } else {
        return acc;
      }
    });
  };

  var prevItem = function prevItem() {
    var selectedIndex = getSelectedIndex();
    var prevIndex = selectedIndex - 1;
    if (prevIndex === -1) {
      prevIndex = menu.length - 1;
    }
    menu[selectedIndex].selected = false;
    menu[prevIndex].selected = true;

    renderMenu();
  };
  
  var nextItem = function nextItem() {
    var selectedIndex = getSelectedIndex();
    var nextIndex = selectedIndex + 1;
    if (nextIndex === menu.length) {
      nextIndex = 0;
    }
    menu[selectedIndex].selected = false;
    menu[nextIndex].selected = true;

    renderMenu();
  };

  var activateItem = function activateItem() {
    if (!menu.isOpen) {
      return;
    }

    var item = getSelectedItem();
    item.action();
  };

  var renderMenu = function renderMenu() {
    menu.forEach(function(item) {
      if (item.selected) {
        item.text.setStyle(fontHighlight);
      } else {
        item.text.setStyle(fontNormal);
      }
      var text = item.name + (item.setting ? ': ' + item.setting.selected.toString() : ''); // TODO: why won't this display numeric settings?
      item.text.setText(text);
    });
  };

  var cycleSetting = function cycleSetting() {
    var optionIndex = this.setting.options.indexOf(this.setting.selected);
    optionIndex++;
    if (optionIndex === this.setting.options.length) {
      optionIndex = 0;
    }
    this.setting.selected = this.setting.options[optionIndex];
    renderMenu();
    restart();
  };

  var menu = [{
    name: 'Players',
    setting: settings.playerCount,
    action: cycleSetting,
    selected: true
  }, {
    name: 'BGM',
    setting: settings.bgm,
    action: cycleSetting
  }, {
    name: 'Stage',
    setting: settings.stage,
    action: cycleSetting
  }, {
    name: 'Start',
    action: function() {
      restart();
      toggleMenu();
    }
  }].map(function(item, i) {
    item.text = game.add.text(0, 0, '');
    item.text.setTextBounds(0, i * itemHeight, game.width, game.height);
    return item;
  });
  menu.isOpen = true;

  // gamepad controls
  if (game.input.gamepad.supported && game.input.gamepad.active && game.input.gamepad.pad1.connected) {
    var startButton = gamepad.getButton(Phaser.Gamepad.XBOX360_START);
    var downButton = gamepad.getButton(Phaser.Gamepad.XBOX360_DPAD_DOWN);
    var upButton = gamepad.getButton(Phaser.Gamepad.XBOX360_DPAD_UP);
    var selectButton = gamepad.getButton(Phaser.Gamepad.XBOX360_A);

    startButton.onDown.add(toggleMenu);
    downButton.onDown.add(nextItem);
    upButton.onDown.add(prevItem);
    selectButton.onDown.add(activateItem);
  }

  //keyboard controls
  // TODO: update menu system to handle RIGHT as activate and LEFT as active in reverse
  // e.g. left increases player count, right decreases it
  game.input.keyboard.addKey(Phaser.Keyboard.ENTER).onDown.add(toggleMenu);
  game.input.keyboard.addKey(Phaser.Keyboard.DOWN).onDown.add(nextItem);
  game.input.keyboard.addKey(Phaser.Keyboard.UP).onDown.add(prevItem);
  game.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR).onDown.add(activateItem);

  renderMenu();
  return menu;
};

module.exports = buildMenu;

},{"./data/font.js":3,"./data/settings.js":5}],9:[function(require,module,exports){
var createPlayer = function createPlayer(game, options, onDeath) {
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
      attack: 'SHIFT'
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
      player.orientation = direction;

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

      actions.orientHearts(direction);
    },
    
    // TODO: fix left hearts position when hp is less than max
    orientHearts: function orientHearts(direction) {
      var heartDistance = 1.1; // how close hearts float by player
      switch (direction) {
        case 'left':
          player.hearts.anchor.setTo(-heartDistance, 0);
          break;
        case 'right':
          player.hearts.anchor.setTo(heartDistance, 0);
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
      var cropWidth = Math.ceil(healthPercentage * heartsWidth);
      var cropRect = new Phaser.Rectangle(0, 0, cropWidth, player.hearts.height);
      player.hearts.crop(cropRect);
    },

    die: function() {
      if (player.isDead) {
        return;
      }

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
        // TODO: this could probably be better architected
        onDeath();
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
  player.hp = player.maxHp = 6; // TODO: allow setting custom hp amount for each player
  player.hearts = game.add.sprite(0, 0, 'hearts');
  var heartsWidth = player.hearts.width;
  player.hearts.setScaleMinMax(1, 1); // prevent hearts scaling w/ player
  var bob = player.hearts.animations.add('bob', [0,1,2,1], 3, true); // name, frames, framerate, loop
  player.hearts.animations.play('bob');
  player.addChild(player.hearts);
  actions.orientHearts(player.orientation);

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

},{"./sfx.js":10}],10:[function(require,module,exports){
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

},{"subpoly":2}],11:[function(require,module,exports){
var stageBuilder = function stageBuilder(game) {
  var settings = require('./data/settings.js');
  var stages = require('./data/stages.js');
  var stage = stages.filter(function(stage) {
    return stage.name === settings.stage.selected;
  })[0];

  game.stage.backgroundColor = stage.backgroundColor;

  var buildPlatforms = function buildPlatforms() {
    var platforms = game.add.group();
    platforms.enableBody = true;

    var platformPositions = stage.platforms.positions;
    platformPositions.forEach(function(position) {
      var platform = platforms.create(position[0], position[1], stage.platforms.color);
      platform.scale.setTo(24, 4);
      platform.body.immovable = true;
    });

    var walls = [];
    walls.push(platforms.create(-16, 32, stage.platforms.color));
    walls.push(platforms.create(304, 32, stage.platforms.color));
    walls.forEach(function(wall) {
      wall.scale.setTo(16, 74);
      wall.body.immovable = true;
    });
    
    return platforms;
  };

  var buildBackgrounds = function buildBackgrounds() {
    var backgrounds = game.add.group();

    stage.backgrounds.forEach(function(layer) {
      var bg;
      if (layer.scrolling) {
        bg = game.add.tileSprite(0, 0, game.width, game.height, layer.image);
        backgrounds.loop = game.time.events.loop(Phaser.Timer.QUARTER, function() {
          bg.tilePosition.x -=1;
        }, this);
      } else {
        bg = game.add.sprite(0, 0, layer.image);
      }
      backgrounds.add(bg);
    });
    
    return backgrounds;
  };

  var buildForeground = function() {
    var foreground = game.add.sprite(0, 0, stage.foreground);
    return foreground;
  };
  
  return {
    buildPlatforms: buildPlatforms,
    buildForeground: buildForeground,
    buildBackgrounds: buildBackgrounds
  };
};

module.exports = stageBuilder;

},{"./data/settings.js":5,"./data/stages.js":6}],12:[function(require,module,exports){
var Play = function(game) {
  var play = {
    create: function create() {
      var self = this;

      self.sfx = require('../sfx.js');
      self.subUi = game.add.group(); // place to keep anything on-screen that's not UI to depth sort below UI

      // game over message
      var font = require('../data/font.js');
      self.text = game.add.text(0, 0, '', font);
      self.text.setTextBounds(0, 0, game.width, game.height);
      
      // menu
      var buildMenu = require('../menu.js');
      self.menu = buildMenu(game, self.restart.bind(self)); // TODO: come up with better way to let menu restart game

      self.restart();
      game.physics.startSystem(Phaser.Physics.ARCADE);
      game.input.gamepad.start();
    },

    restart: function restart() {
      var self = this;
      var players = require('../data/players.js')(game);
      var settings = require('../data/settings');
      var stageBuilder = require('../stageBuilder.js')(game);

      // destroy and rebuild stage and players
      var destroyGroup = function destroyGroup(group) {
        if (!group) {
          return;
        }

        while (group.children.length > 0) {
          group.children[0].destroy();
        }

        group.destroy();
      }

      destroyGroup(self.players);
      destroyGroup(self.platforms);
      destroyGroup(self.backgrounds);
      // TODO: ugh, clean this up!
      if (self.backgrounds && self.backgrounds.loop) {
        game.time.events.remove(self.backgrounds.loop);
      }
      if (self.foreground) {
        self.foreground.destroy();
      }

      self.platforms = stageBuilder.buildPlatforms();
      self.backgrounds = stageBuilder.buildBackgrounds();
      self.subUi.add(self.platforms);
      self.subUi.add(self.backgrounds);

      self.players = game.add.group();
      self.subUi.add(self.players);

      var addPlayer = function addPlayer(player) {
        var checkForGameOver = function checkForGameOver() {
          if (self.menu.isOpen) {
            return; // we're not really playing a game yet :) this has some problems, though...
          }

          var alivePlayers = [];
          self.players.children.forEach(function(player) {
            if (!player.isDead) {
              alivePlayers.push(player.name);
            }
          });
          if (alivePlayers.length === 1) {
            self.text.setText(alivePlayers[0] + '  wins!\nPress start');
            self.text.visible = true;
            game.input.gamepad.pad1.getButton(Phaser.Gamepad.XBOX360_START).onDown.addOnce(function() {
              self.text.visible = false; // just hides text (menu will open itself)
            });
          }
        };
        var createPlayer = require('../player.js');
        self.players.add(createPlayer(game, player, checkForGameOver));
      };

      //players.forEach(addPlayer);
      for (var i=0; i<settings.playerCount.selected; i++) {
        addPlayer(players[i]);
      }

      self.foreground = stageBuilder.buildForeground();
      self.subUi.add(self.foreground);
    },

    update: function update() {
      var self = this;
      
      game.physics.arcade.collide(this.players, this.platforms);
      // TODO: how do i do this on the player itself without access to players? or should i add a ftn to player and set that as the cb?
      game.physics.arcade.collide(this.players, this.players, function handlePlayerCollision(playerA, playerB) {
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
          self.sfx.bounce();

          var bounceVelocity = 100;
          var velocityA, velocityB;
          velocityA = velocityB = bounceVelocity;
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
          self.sfx.bounce();

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
          self.sfx.bounce();

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
        if (!playerA.isCollidable || !playerB.isCollidable || playerA.position.y > game.height || playerB.position.y > game.height) {
          return false;
        }
        return true;
      });
    }
  };
  
  return play;
};

module.exports = Play;

},{"../data/font.js":3,"../data/players.js":4,"../data/settings":5,"../menu.js":8,"../player.js":9,"../sfx.js":10,"../stageBuilder.js":11}],13:[function(require,module,exports){
var Splash = function(game) {
  var splash = {
    init: function() {
      var sfx = require('../sfx.js');

      // intro animation
      sfx.jump();
      var dude = game.add.sprite(game.world.centerX, 100, 'purple');
      dude.scale.setTo(8, 16);
      game.add.tween(dude).to({y: 0}, 200, 'Linear').start();
    },

    preload: function() {
      // images
      game.load.image('clear', 'images/clear.png');
      game.load.image('white', 'images/white.png');
      game.load.image('pink', 'images/pink.png');
      game.load.image('yellow', 'images/yellow.png');
      game.load.image('blue', 'images/blue.png');
      game.load.image('orange', 'images/orange.png');
      game.load.image('green', 'images/green.png');

      game.load.spritesheet('hearts', 'images/hearts.png', 9, 5); // player health

      // TODO: why doesn't this load images for me?
      var stages = require('../data/stages.js');
      /*stages.forEach(function(stage) {
        var images = [].concat(stage.assets.background, stage.assets.foreground, stage.assets.scrolling);
        console.log('images:', images);
        images.forEach(function(image) {
          game.load.image(image.name, 'images/' + image.name + '.png');
        });
      });*/

      game.load.image('ground', 'images/ground.png');
      game.load.image('foreground', 'images/foreground.png');
      game.load.image('clouds', 'images/clouds.png');
      game.load.image('suns', 'images/suns.png');
    },

    create: function() {
      var startGame = function startGame() {
        clearTimeout(timeout);
        if (game.state.current === 'splash') {
          game.state.start('play');
        }
      };
      
      // start game after a delay...
      var timeout = setTimeout(startGame, 100); // TODO: increase delay...

      // ...or when start/enter is pressed
      game.input.keyboard.addKey(Phaser.Keyboard.ENTER).onDown.addOnce(startGame);
      if (game.input.gamepad.supported && game.input.gamepad.active && game.input.gamepad.pad1.connected) {
        game.input.gamepad.pad1.getButton(Phaser.Gamepad.XBOX360_START).onDown.addOnce(startGame);
      }
    }
  };
  
  return splash;
};

module.exports = Splash;

},{"../data/stages.js":6,"../sfx.js":10}],14:[function(require,module,exports){
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
  },

  center: function(entity) {
    entity.anchor.setTo(0.5);
  },
};

module.exports = utils;

},{}]},{},[7])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvc3VibW9uby9zdWJtb25vLmpzIiwibm9kZV9tb2R1bGVzL3N1YnBvbHkvc3VicG9seS5qcyIsInNjcmlwdHMvZGF0YS9mb250LmpzIiwic2NyaXB0cy9kYXRhL3BsYXllcnMuanMiLCJzY3JpcHRzL2RhdGEvc2V0dGluZ3MuanMiLCJzY3JpcHRzL2RhdGEvc3RhZ2VzLmpzIiwic2NyaXB0cy9tYWluLmpzIiwic2NyaXB0cy9tZW51LmpzIiwic2NyaXB0cy9wbGF5ZXIuanMiLCJzY3JpcHRzL3NmeC5qcyIsInNjcmlwdHMvc3RhZ2VCdWlsZGVyLmpzIiwic2NyaXB0cy9zdGF0ZXMvcGxheS5qcyIsInNjcmlwdHMvc3RhdGVzL3NwbGFzaC5qcyIsInNjcmlwdHMvdXRpbHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqR0E7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ2YXIgTW9ub3N5bnRoID0gZnVuY3Rpb24gTW9ub3N5bnRoKGF1ZGlvQ3R4LCBjb25maWcpIHtcbiAgdmFyIHN5bnRoO1xuICB2YXIgU3ludGggPSBmdW5jdGlvbiBTeW50aCgpIHtcbiAgICBzeW50aCA9IHRoaXM7XG4gICAgY29uZmlnID0gY29uZmlnIHx8IHt9O1xuICAgIGNvbmZpZy5jdXRvZmYgPSBjb25maWcuY3V0b2ZmIHx8IHt9O1xuXG4gICAgc3ludGguYXVkaW9DdHggPSBhdWRpb0N0eCxcbiAgICBzeW50aC5hbXAgICAgICA9IGF1ZGlvQ3R4LmNyZWF0ZUdhaW4oKSxcbiAgICBzeW50aC5maWx0ZXIgICA9IGF1ZGlvQ3R4LmNyZWF0ZUJpcXVhZEZpbHRlcigpLFxuICAgIHN5bnRoLm9zYyAgICAgID0gYXVkaW9DdHguY3JlYXRlT3NjaWxsYXRvcigpLFxuICAgIHN5bnRoLnBhbiAgICAgID0gYXVkaW9DdHguY3JlYXRlUGFubmVyKCksXG5cbiAgICBzeW50aC5tYXhHYWluICA9IGNvbmZpZy5tYXhHYWluICB8fCAwLjksIC8vIG91dCBvZiAxXG4gICAgc3ludGguYXR0YWNrICAgPSBjb25maWcuYXR0YWNrICAgfHwgMC4xLCAvLyBpbiBzZWNvbmRzXG4gICAgc3ludGguZGVjYXkgICAgPSBjb25maWcuZGVjYXkgICAgfHwgMC4wLCAvLyBpbiBzZWNvbmRzXG4gICAgc3ludGguc3VzdGFpbiAgPSBjb25maWcuc3VzdGFpbiAgfHwgMS4wLCAvLyBvdXQgb2YgMVxuICAgIHN5bnRoLnJlbGVhc2UgID0gY29uZmlnLnJlbGVhc2UgIHx8IDAuOCwgLy8gaW4gc2Vjb25kc1xuXG4gICAgLy8gbG93LXBhc3MgZmlsdGVyXG4gICAgc3ludGguY3V0b2ZmICAgICAgICAgICAgICA9IHN5bnRoLmZpbHRlci5mcmVxdWVuY3k7XG4gICAgc3ludGguY3V0b2ZmLm1heEZyZXF1ZW5jeSA9IGNvbmZpZy5jdXRvZmYubWF4RnJlcXVlbmN5IHx8IDc1MDA7IC8vIGluIGhlcnR6XG4gICAgc3ludGguY3V0b2ZmLmF0dGFjayAgICAgICA9IGNvbmZpZy5jdXRvZmYuYXR0YWNrICAgICAgIHx8IDAuMTsgLy8gaW4gc2Vjb25kc1xuICAgIHN5bnRoLmN1dG9mZi5kZWNheSAgICAgICAgPSBjb25maWcuY3V0b2ZmLmRlY2F5ICAgICAgICB8fCAyLjU7IC8vIGluIHNlY29uZHNcbiAgICBzeW50aC5jdXRvZmYuc3VzdGFpbiAgICAgID0gY29uZmlnLmN1dG9mZi5zdXN0YWluICAgICAgfHwgMC4yOyAvLyBvdXQgb2YgMVxuICAgIFxuICAgIHN5bnRoLmFtcC5nYWluLnZhbHVlID0gMDtcbiAgICBzeW50aC5maWx0ZXIudHlwZSA9ICdsb3dwYXNzJztcbiAgICBzeW50aC5maWx0ZXIuY29ubmVjdChzeW50aC5hbXApO1xuICAgIHN5bnRoLmFtcC5jb25uZWN0KGF1ZGlvQ3R4LmRlc3RpbmF0aW9uKTtcbiAgICBzeW50aC5wYW4ucGFubmluZ01vZGVsID0gJ2VxdWFscG93ZXInO1xuICAgIHN5bnRoLnBhbi5zZXRQb3NpdGlvbigwLCAwLCAxKTsgLy8gc3RhcnQgd2l0aCBzdGVyZW8gaW1hZ2UgY2VudGVyZWRcbiAgICBzeW50aC5vc2MuY29ubmVjdChzeW50aC5wYW4pO1xuICAgIHN5bnRoLnBhbi5jb25uZWN0KHN5bnRoLmZpbHRlcik7XG4gICAgc3ludGgub3NjLnN0YXJ0KDApO1xuICAgIFxuICAgIHN5bnRoLndhdmVmb3JtKGNvbmZpZy53YXZlZm9ybSB8fCAnc2luZScpO1xuICAgIHN5bnRoLnBpdGNoKGNvbmZpZy5waXRjaCB8fCA0NDApO1xuXG4gICAgcmV0dXJuIHN5bnRoO1xuICB9O1xuXG4gIGZ1bmN0aW9uIGdldE5vdygpIHtcbiAgICB2YXIgbm93ID0gc3ludGguYXVkaW9DdHguY3VycmVudFRpbWU7XG4gICAgc3ludGguYW1wLmdhaW4uY2FuY2VsU2NoZWR1bGVkVmFsdWVzKG5vdyk7XG4gICAgc3ludGguYW1wLmdhaW4uc2V0VmFsdWVBdFRpbWUoc3ludGguYW1wLmdhaW4udmFsdWUsIG5vdyk7XG4gICAgcmV0dXJuIG5vdztcbiAgfTtcbiAgXG4gIFN5bnRoLnByb3RvdHlwZS5waXRjaCA9IGZ1bmN0aW9uIHBpdGNoKG5ld1BpdGNoKSB7XG4gICAgaWYgKG5ld1BpdGNoKSB7XG4gICAgICB2YXIgbm93ID0gc3ludGguYXVkaW9DdHguY3VycmVudFRpbWU7XG4gICAgICBzeW50aC5vc2MuZnJlcXVlbmN5LnNldFZhbHVlQXRUaW1lKG5ld1BpdGNoLCBub3cpO1xuICAgIH1cbiAgICByZXR1cm4gc3ludGgub3NjLmZyZXF1ZW5jeS52YWx1ZTtcbiAgfTtcblxuICBTeW50aC5wcm90b3R5cGUud2F2ZWZvcm0gPSBmdW5jdGlvbiB3YXZlZm9ybShuZXdXYXZlZm9ybSkge1xuICAgIGlmIChuZXdXYXZlZm9ybSkge1xuICAgICAgc3ludGgub3NjLnR5cGUgPSBuZXdXYXZlZm9ybTtcbiAgICB9XG4gICAgcmV0dXJuIHN5bnRoLm9zYy50eXBlO1xuICB9O1xuXG4gIC8vIGFwcGx5IGF0dGFjaywgZGVjYXksIHN1c3RhaW4gZW52ZWxvcGVcbiAgU3ludGgucHJvdG90eXBlLnN0YXJ0ID0gZnVuY3Rpb24gc3RhcnRTeW50aCgpIHtcbiAgICB2YXIgYXRrICA9IHBhcnNlRmxvYXQoc3ludGguYXR0YWNrKTtcbiAgICB2YXIgZGVjICA9IHBhcnNlRmxvYXQoc3ludGguZGVjYXkpO1xuICAgIHZhciBjQXRrID0gcGFyc2VGbG9hdChzeW50aC5jdXRvZmYuYXR0YWNrKTtcbiAgICB2YXIgY0RlYyA9IHBhcnNlRmxvYXQoc3ludGguY3V0b2ZmLmRlY2F5KTtcbiAgICB2YXIgbm93ICA9IGdldE5vdygpO1xuICAgIHN5bnRoLmN1dG9mZi5jYW5jZWxTY2hlZHVsZWRWYWx1ZXMobm93KTtcbiAgICBzeW50aC5jdXRvZmYubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoc3ludGguY3V0b2ZmLnZhbHVlLCBub3cpO1xuICAgIHN5bnRoLmN1dG9mZi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZShzeW50aC5jdXRvZmYubWF4RnJlcXVlbmN5LCBub3cgKyBjQXRrKTtcbiAgICBzeW50aC5jdXRvZmYubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoc3ludGguY3V0b2ZmLnN1c3RhaW4gKiBzeW50aC5jdXRvZmYubWF4RnJlcXVlbmN5LCBub3cgKyBjQXRrICsgY0RlYyk7XG4gICAgc3ludGguYW1wLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoc3ludGgubWF4R2Fpbiwgbm93ICsgYXRrKTtcbiAgICBzeW50aC5hbXAuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZShzeW50aC5zdXN0YWluICogc3ludGgubWF4R2Fpbiwgbm93ICsgYXRrICsgZGVjKTtcbiAgfTtcblxuICAvLyBhcHBseSByZWxlYXNlIGVudmVsb3BlXG4gIFN5bnRoLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24gc3RvcFN5bnRoKCkge1xuICAgIHZhciByZWwgPSBwYXJzZUZsb2F0KHN5bnRoLnJlbGVhc2UpO1xuICAgIHZhciBub3cgPSBnZXROb3coKTtcbiAgICBzeW50aC5hbXAuZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgwLCBub3cgKyByZWwpO1xuICB9O1xuXG4gIHJldHVybiBuZXcgU3ludGgoKTtcbn07XG5cbi8vIG5wbSBzdXBwb3J0XG5pZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIG1vZHVsZS5leHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICBtb2R1bGUuZXhwb3J0cyA9IE1vbm9zeW50aDtcbn1cbiIsIi8vIG5wbSBzdXBwb3J0XG5pZiAodHlwZW9mIHJlcXVpcmUgIT09ICd1bmRlZmluZWQnKSB7XG4gIHZhciBNb25vc3ludGggPSByZXF1aXJlKCdzdWJtb25vJyk7XG59XG5cbnZhciBQb2x5c3ludGggPSBmdW5jdGlvbiBQb2x5c3ludGgoYXVkaW9DdHgsIGNvbmZpZykge1xuICB2YXIgc3ludGg7XG4gIHZhciBTeW50aCA9IGZ1bmN0aW9uIFN5bnRoKCkge1xuICAgIHN5bnRoID0gdGhpcztcbiAgICBzeW50aC5hdWRpb0N0eCA9IGF1ZGlvQ3R4O1xuICAgIHN5bnRoLnZvaWNlcyA9IFtdO1xuICAgIFxuICAgIGNvbmZpZyA9IGNvbmZpZyB8fCB7fTtcbiAgICBjb25maWcuY3V0b2ZmID0gY29uZmlnLmN1dG9mZiB8fCB7fTtcblxuXG4gICAgZm9yICh2YXIgaSA9IDAsIGlpID0gY29uZmlnLm51bVZvaWNlcyB8fCAxNjsgaSA8IGlpOyBpKyspIHtcbiAgICAgIHN5bnRoLnZvaWNlcy5wdXNoKG5ldyBNb25vc3ludGgoYXVkaW9DdHgsIGNvbmZpZykpO1xuICAgIH1cblxuICAgIHN5bnRoLnN0ZXJlb1dpZHRoID0gY29uZmlnLnN0ZXJlb1dpZHRoIHx8IDAuNTsgLy8gb3V0IG9mIDFcbiAgICBzeW50aC53aWR0aChzeW50aC5zdGVyZW9XaWR0aCk7XG5cbiAgICByZXR1cm4gc3ludGg7XG4gIH07XG5cbiAgLy8gYXBwbHkgYXR0YWNrLCBkZWNheSwgc3VzdGFpbiBlbnZlbG9wZVxuICBTeW50aC5wcm90b3R5cGUuc3RhcnQgPSBmdW5jdGlvbiBzdGFydFN5bnRoKCkge1xuICAgIHN5bnRoLnZvaWNlcy5mb3JFYWNoKGZ1bmN0aW9uIHN0YXJ0Vm9pY2Uodm9pY2UpIHtcbiAgICAgIHZvaWNlLnN0YXJ0KCk7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gYXBwbHkgcmVsZWFzZSBlbnZlbG9wZVxuICBTeW50aC5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uIHN0b3BTeW50aCgpIHtcbiAgICBzeW50aC52b2ljZXMuZm9yRWFjaChmdW5jdGlvbiBzdG9wVm9pY2Uodm9pY2UpIHtcbiAgICAgIHZvaWNlLnN0b3AoKTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBnZXQvc2V0IHN5bnRoIHN0ZXJlbyB3aWR0aFxuICBTeW50aC5wcm90b3R5cGUud2lkdGggPSBmdW5jdGlvbiB3aWR0aChuZXdXaWR0aCkge1xuICAgIGlmIChzeW50aC52b2ljZXMubGVuZ3RoID4gMSAmJiBuZXdXaWR0aCkge1xuICAgICAgc3ludGguc3RlcmVvV2lkdGggPSBuZXdXaWR0aDtcbiAgICAgIHN5bnRoLnZvaWNlcy5mb3JFYWNoKGZ1bmN0aW9uIHBhblZvaWNlKHZvaWNlLCBpKSB7XG4gICAgICAgIHZhciBzcHJlYWQgPSAxLyhzeW50aC52b2ljZXMubGVuZ3RoIC0gMSk7XG4gICAgICAgIHZhciB4UG9zID0gc3ByZWFkICogaSAqIHN5bnRoLnN0ZXJlb1dpZHRoO1xuICAgICAgICB2YXIgelBvcyA9IDEgLSBNYXRoLmFicyh4UG9zKTtcbiAgICAgICAgdm9pY2UucGFuLnNldFBvc2l0aW9uKHhQb3MsIDAsIHpQb3MpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHN5bnRoLnN0ZXJlb1dpZHRoO1xuICB9O1xuXG4gIC8vIGNvbnZlbmllbmNlIG1ldGhvZHMgZm9yIGNoYW5naW5nIHZhbHVlcyBvZiBhbGwgTW9ub3N5bnRocycgcHJvcGVydGllcyBhdCBvbmNlXG4gIChmdW5jdGlvbiBjcmVhdGVTZXR0ZXJzKCkge1xuICAgIHZhciBtb25vc3ludGhQcm9wZXJ0aWVzID0gWydtYXhHYWluJywgJ2F0dGFjaycsICdkZWNheScsICdzdXN0YWluJywgJ3JlbGVhc2UnXTtcbiAgICB2YXIgbW9ub3N5bnRoQ3V0b2ZmUHJvcGVydGllcyA9IFsnbWF4RnJlcXVlbmN5JywgJ2F0dGFjaycsICdkZWNheScsICdzdXN0YWluJ107XG5cbiAgICBtb25vc3ludGhQcm9wZXJ0aWVzLmZvckVhY2goZnVuY3Rpb24gY3JlYXRlU2V0dGVyKHByb3BlcnR5KSB7XG4gICAgICBTeW50aC5wcm90b3R5cGVbcHJvcGVydHldID0gZnVuY3Rpb24gc2V0VmFsdWVzKG5ld1ZhbHVlKSB7XG4gICAgICAgIHN5bnRoLnZvaWNlcy5mb3JFYWNoKGZ1bmN0aW9uIHNldFZhbHVlKHZvaWNlKSB7XG4gICAgICAgICAgdm9pY2VbcHJvcGVydHldID0gbmV3VmFsdWU7XG4gICAgICAgIH0pO1xuICAgICAgfTtcbiAgICB9KTtcblxuICAgIFN5bnRoLnByb3RvdHlwZS5jdXRvZmYgPSB7fTtcbiAgICBtb25vc3ludGhDdXRvZmZQcm9wZXJ0aWVzLmZvckVhY2goZnVuY3Rpb24gY3JlYXRlU2V0dGVyKHByb3BlcnR5KSB7XG4gICAgICBTeW50aC5wcm90b3R5cGUuY3V0b2ZmW3Byb3BlcnR5XSA9IGZ1bmN0aW9uIHNldFZhbHVlcyhuZXdWYWx1ZSkge1xuICAgICAgICBzeW50aC52b2ljZXMuZm9yRWFjaChmdW5jdGlvbiBzZXRWYWx1ZSh2b2ljZSkge1xuICAgICAgICAgIHZvaWNlLmN1dG9mZltwcm9wZXJ0eV0gPSBuZXdWYWx1ZTtcbiAgICAgICAgfSk7XG4gICAgICB9O1xuICAgIH0pO1xuXG4gICAgU3ludGgucHJvdG90eXBlLndhdmVmb3JtID0gZnVuY3Rpb24gd2F2ZWZvcm0obmV3V2F2ZWZvcm0pIHtcbiAgICAgIHN5bnRoLnZvaWNlcy5mb3JFYWNoKGZ1bmN0aW9uIHdhdmVmb3JtKHZvaWNlKSB7XG4gICAgICAgIHZvaWNlLndhdmVmb3JtKG5ld1dhdmVmb3JtKTtcbiAgICAgIH0pO1xuICAgIH07XG5cbiAgICBTeW50aC5wcm90b3R5cGUucGl0Y2ggPSBmdW5jdGlvbiBwaXRjaChuZXdQaXRjaCkge1xuICAgICAgc3ludGgudm9pY2VzLmZvckVhY2goZnVuY3Rpb24gcGl0Y2godm9pY2UpIHtcbiAgICAgICAgdm9pY2UucGl0Y2gobmV3UGl0Y2gpO1xuICAgICAgfSk7XG4gICAgfTtcbiAgfSkoKTtcblxuICByZXR1cm4gbmV3IFN5bnRoO1xufTtcblxuLy8gbnBtIHN1cHBvcnRcbmlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgbW9kdWxlLmV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gIG1vZHVsZS5leHBvcnRzID0gUG9seXN5bnRoO1xufVxuIiwidmFyIGZvbnQgPSB7IGZvbnQ6IFwiMjBweCBIZWx2ZXRpY2FcIiwgZmlsbDogXCIjRUQxQzI0XCIsIGFsaWduOiBcImNlbnRlclwiLCBib3VuZHNBbGlnbkg6IFwiY2VudGVyXCIsIGJvdW5kc0FsaWduVjogXCJtaWRkbGVcIiB9O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZvbnQ7XG4iLCJ2YXIgUGxheWVycyA9IGZ1bmN0aW9uKGdhbWUpIHtcbiAgICB2YXIgcGxheWVycyA9IFt7XG4gICAgICBuYW1lOiAnT3JhbmdlJyxcbiAgICAgIGNvbG9yOiAnb3JhbmdlJyxcbiAgICAgIGdhbWVwYWQ6IGdhbWUuaW5wdXQuZ2FtZXBhZC5wYWQxLFxuICAgICAgcG9zaXRpb246IHtcbiAgICAgICAgeDogNzIsIHk6IDQ0XG4gICAgICB9LFxuICAgICAga2V5czoge1xuICAgICAgICB1cDogJ1cnLCBkb3duOiAnUycsIGxlZnQ6ICdBJywgcmlnaHQ6ICdEJywgYXR0YWNrOiAnUSdcbiAgICAgIH0sXG4gICAgfSwge1xuICAgICAgbmFtZTogJ1llbGxvdycsXG4gICAgICBjb2xvcjogJ3llbGxvdycsXG4gICAgICBnYW1lcGFkOiBnYW1lLmlucHV0LmdhbWVwYWQucGFkMixcbiAgICAgIHBvc2l0aW9uOiB7XG4gICAgICAgIHg6IDI0OCwgeTogNDRcbiAgICAgIH0sXG4gICAgICBvcmllbnRhdGlvbjogJ2xlZnQnLFxuICAgIH0sIHtcbiAgICAgIG5hbWU6ICdQaW5rJyxcbiAgICAgIGNvbG9yOiAncGluaycsXG4gICAgICBnYW1lcGFkOiBnYW1lLmlucHV0LmdhbWVwYWQucGFkMyxcbiAgICAgIHBvc2l0aW9uOiB7XG4gICAgICAgIHg6IDcyLCB5OiAxMzZcbiAgICAgIH0sXG4gICAgICBrZXlzOiB7XG4gICAgICAgIHVwOiAnSScsIGRvd246ICdLJywgbGVmdDogJ0onLCByaWdodDogJ0wnLCBhdHRhY2s6ICdVJ1xuICAgICAgfSxcbiAgICB9LCB7XG4gICAgICBuYW1lOiAnUHVycGxlJyxcbiAgICAgIGNvbG9yOiAncHVycGxlJyxcbiAgICAgIGdhbWVwYWQ6IGdhbWUuaW5wdXQuZ2FtZXBhZC5wYWQ0LFxuICAgICAgcG9zaXRpb246IHtcbiAgICAgICAgeDogMjQ4LCB5OiAxMzZcbiAgICAgIH0sXG4gICAgICBvcmllbnRhdGlvbjogJ2xlZnQnLFxuICAgICAga2V5czoge1xuICAgICAgICB1cDogJ1QnLCBkb3duOiAnRycsIGxlZnQ6ICdGJywgcmlnaHQ6ICdIJywgYXR0YWNrOiAnUidcbiAgICAgIH0sXG4gIH1dO1xuICBcbiAgcmV0dXJuIHBsYXllcnM7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFBsYXllcnM7XG4iLCJ2YXIgc3RhZ2VzID0gcmVxdWlyZSgnLi9zdGFnZXMnKTtcblxudmFyIHNldHRpbmdzID0ge1xuICBwbGF5ZXJDb3VudDoge1xuICAgIG9wdGlvbnM6IFsyLCAzLCA0XSxcbiAgICBzZWxlY3RlZDogNCxcbiAgfSxcbiAgYmdtOiB7XG4gICAgb3B0aW9uczogWydBJywgJ0InLCAnTm9uZSddLFxuICAgIHNlbGVjdGVkOiAnTm9uZScsXG4gIH0sXG4gIHN0YWdlOiB7XG4gICAgb3B0aW9uczogc3RhZ2VzLm1hcChmdW5jdGlvbihzdGFnZSkge1xuICAgICAgcmV0dXJuIHN0YWdlLm5hbWU7XG4gICAgfSksXG4gICAgc2VsZWN0ZWQ6ICdBbHBoYSBDJyxcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBzZXR0aW5ncztcbiIsInZhciBzdGFnZXMgPSBbe1xuICBuYW1lOiAnQWxwaGEgQycsXG4gIGJhY2tncm91bmRDb2xvcjogJyM0REQ4RkYnLFxuICBwbGF0Zm9ybXM6IHtcbiAgICBwb3NpdGlvbnM6IFtbNDgsIDY0XSwgWzIyNCwgNjRdLCBbMTM2LCAxMDRdLCBbNDgsIDE1NCxdLCBbMjI0LCAxNTRdXSxcbiAgICBjb2xvcjogJ2NsZWFyJ1xuICB9LFxuICBiYWNrZ3JvdW5kczogW3tcbiAgICBpbWFnZTogJ3N1bnMnXG4gIH0se1xuICAgIGltYWdlOiAnY2xvdWRzJyxcbiAgICBzY3JvbGxpbmc6IHRydWUsXG4gIH0se1xuICAgIGltYWdlOiAnZ3JvdW5kJ1xuICB9XSxcbiAgZm9yZWdyb3VuZDogJ2ZvcmVncm91bmQnXG59LCB7XG4gIG5hbWU6ICdBdGFyaScsXG4gIGJhY2tncm91bmRDb2xvcjogJyMwMDAnLFxuICBwbGF0Zm9ybXM6IHtcbiAgICBwb3NpdGlvbnM6IFtbNDgsIDY0XSwgWzIyNCwgNjRdLCBbMTM2LCAxMDRdLCBbNDgsIDE1NCxdLCBbMjI0LCAxNTRdXSxcbiAgICBjb2xvcjogJ2JsdWUnXG4gIH0sXG4gIGJhY2tncm91bmRzOiBbXSxcbiAgZm9yZWdyb3VuZDogJ2NsZWFyJ1xufSwge1xuICBuYW1lOiAnVm9pZCcsXG4gIGJhY2tncm91bmRDb2xvcjogJyMwMDAnLFxuICBwbGF0Zm9ybXM6IHtcbiAgICBwb3NpdGlvbnM6IFtdLFxuICAgIGNvbG9yOiAnY2xlYXInXG4gIH0sXG4gIGJhY2tncm91bmRzOiBbXSxcbiAgZm9yZWdyb3VuZDogJ2NsZWFyJ1xufV07XG5cbm1vZHVsZS5leHBvcnRzID0gc3RhZ2VzO1xuIiwidmFyIHJlc2l6ZSA9IGZ1bmN0aW9uIHJlc2l6ZSgpIHtcbiAgZG9jdW1lbnQuYm9keS5zdHlsZS56b29tID0gd2luZG93LmlubmVyV2lkdGggLyBnYW1lLndpZHRoO1xufTtcblxudmFyIG1haW4gPSB7XG4gIHByZWxvYWQ6IGZ1bmN0aW9uIHByZWxvYWQoKSB7XG4gICAgdmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG4gICAgcmVzaXplKCk7XG4gICAgd2luZG93Lm9ucmVzaXplID0gdXRpbHMuZGVib3VuY2UocmVzaXplLCAxMDApO1xuICAgIFxuICAgIC8vIGFsbG93IGFueXRoaW5nIHVwIHRvIGhlaWdodCBvZiB3b3JsZCB0byBmYWxsIG9mZi1zY3JlZW4gdXAgb3IgZG93blxuICAgIGdhbWUud29ybGQuc2V0Qm91bmRzKDAsIC1nYW1lLndpZHRoLCBnYW1lLndpZHRoLCBnYW1lLmhlaWdodCAqIDMpO1xuICAgIFxuICAgIC8vIHByZXZlbnQgZ2FtZSBwYXVzaW5nIHdoZW4gaXQgbG9zZXMgZm9jdXNcbiAgICBnYW1lLnN0YWdlLmRpc2FibGVWaXNpYmlsaXR5Q2hhbmdlID0gdHJ1ZTtcbiAgICBcbiAgICAvLyBhc3NldHMgdXNlZCBpbiBzcGxhc2ggc2NyZWVuIGludHJvIGFuaW1hdGlvblxuICAgIGdhbWUubG9hZC5pbWFnZSgncHVycGxlJywgJ2ltYWdlcy9wdXJwbGUucG5nJyk7XG4gIH0sXG5cbiAgY3JlYXRlOiBmdW5jdGlvbiBjcmVhdGUoKSB7XG4gICAgZ2FtZS5pbnB1dC5nYW1lcGFkLnN0YXJ0KCk7XG5cbiAgICBnYW1lLnN0YXRlLmFkZCgnc3BsYXNoJywgcmVxdWlyZSgnLi9zdGF0ZXMvc3BsYXNoLmpzJykoZ2FtZSkpO1xuICAgIGdhbWUuc3RhdGUuYWRkKCdwbGF5JywgcmVxdWlyZSgnLi9zdGF0ZXMvcGxheS5qcycpKGdhbWUpKTtcblxuICAgIGdhbWUuc3RhdGUuc3RhcnQoJ3NwbGFzaCcpO1xuICB9XG59O1xuXG52YXIgZ2FtZSA9IG5ldyBQaGFzZXIuR2FtZSgzMjAsIDE4MCwgUGhhc2VyLkFVVE8sICdnYW1lJywge1xuICBwcmVsb2FkOiBtYWluLnByZWxvYWQsXG4gIGNyZWF0ZTogbWFpbi5jcmVhdGVcbn0sIGZhbHNlLCBmYWxzZSk7IC8vIGRpc2FibGUgYW50aS1hbGlhc2luZ1xuXG5nYW1lLnN0YXRlLmFkZCgnbWFpbicsIG1haW4pO1xuZ2FtZS5zdGF0ZS5zdGFydCgnbWFpbicpO1xuIiwidmFyIGJ1aWxkTWVudSA9IGZ1bmN0aW9uIGJ1aWxkTWVudShnYW1lLCByZXN0YXJ0KSB7XG4gIHZhciBpdGVtSGVpZ2h0ID0gMjA7XG4gIHZhciBnYW1lcGFkID0gZ2FtZS5pbnB1dC5nYW1lcGFkLnBhZDE7XG4gIHZhciBzZXR0aW5ncyA9IHJlcXVpcmUoJy4vZGF0YS9zZXR0aW5ncy5qcycpO1xuICB2YXIgZm9udEhpZ2hsaWdodCA9IHJlcXVpcmUoJy4vZGF0YS9mb250LmpzJyk7XG4gIHZhciBmb250Tm9ybWFsID0gT2JqZWN0LmFzc2lnbih7fSwgZm9udEhpZ2hsaWdodCwge2ZpbGw6ICcjNzc3J30pO1xuXG4gIHZhciB0aXRsZSA9IGdhbWUuYWRkLnRleHQoMCwgLWl0ZW1IZWlnaHQsICdPUFRJT05TJywgZm9udEhpZ2hsaWdodCk7XG4gIHRpdGxlLnNldFRleHRCb3VuZHMoMCwgMCwgZ2FtZS53aWR0aCwgZ2FtZS5oZWlnaHQpO1xuXG4gIHZhciBzZWxlY3RGaXJzdEl0ZW0gPSBmdW5jdGlvbiBzZWxlY3RGaXJzdEl0ZW0oKSB7XG4gICAgdmFyIHNlbGVjdGVkSW5kZXggPSBnZXRTZWxlY3RlZEluZGV4KCk7XG4gICAgaWYgKHNlbGVjdGVkSW5kZXggIT09IDApIHtcbiAgICAgIG1lbnVbc2VsZWN0ZWRJbmRleF0uc2VsZWN0ZWQgPSBmYWxzZTtcbiAgICAgIG1lbnVbMF0uc2VsZWN0ZWQgPSB0cnVlO1xuICAgICAgcmVuZGVyTWVudSgpO1xuICAgIH1cbiAgfTtcblxuICB2YXIgc2VsZWN0U3RhcnQgPSBmdW5jdGlvbiBzZWxlY3RTdGFydCgpIHtcbiAgICB2YXIgc3RhcnRJbmRleCA9IG1lbnUubGVuZ3RoIC0gMTtcbiAgICB2YXIgc2VsZWN0ZWRJbmRleCA9IGdldFNlbGVjdGVkSW5kZXgoKTtcbiAgICBpZiAoc2VsZWN0ZWRJbmRleCAhPT0gc3RhcnRJbmRleCkge1xuICAgICAgbWVudVtzZWxlY3RlZEluZGV4XS5zZWxlY3RlZCA9IGZhbHNlO1xuICAgICAgbWVudVtzdGFydEluZGV4XS5zZWxlY3RlZCA9IHRydWU7XG4gICAgICByZW5kZXJNZW51KCk7XG4gICAgfVxuICB9O1xuXG4gIHZhciB0b2dnbGVNZW51ID0gZnVuY3Rpb24gdG9nZ2xlTWVudSgpIHtcbiAgICBtZW51LmZvckVhY2goZnVuY3Rpb24oaXRlbSkge1xuICAgICAgaWYgKG1lbnUuaXNPcGVuKSB7XG4gICAgICAgIGl0ZW0udGV4dC52aXNpYmxlID0gZmFsc2U7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpdGVtLnRleHQudmlzaWJsZSA9IHRydWU7XG4gICAgICAgIHNlbGVjdFN0YXJ0KCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICB0aXRsZS52aXNpYmxlID0gbWVudS5pc09wZW4gPSAhbWVudS5pc09wZW47XG4gIH07XG5cbiAgdmFyIGdldFNlbGVjdGVkSW5kZXggPSBmdW5jdGlvbiBnZXRTZWxlY3RlZEluZGV4KCkge1xuICAgIHJldHVybiBtZW51LnJlZHVjZShmdW5jdGlvbihhY2MsIGl0ZW0sIGkpIHtcbiAgICAgIGlmIChpdGVtLnNlbGVjdGVkKSB7XG4gICAgICAgIHJldHVybiBpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgIH1cbiAgICB9LCAwKTtcbiAgfTtcblxuICB2YXIgZ2V0U2VsZWN0ZWRJdGVtID0gZnVuY3Rpb24gZ2V0U2VsZWN0ZWRJdGVtKCkge1xuICAgIHJldHVybiBtZW51LnJlZHVjZShmdW5jdGlvbihhY2MsIGl0ZW0pIHtcbiAgICAgIGlmIChpdGVtLnNlbGVjdGVkKSB7XG4gICAgICAgIHJldHVybiBpdGVtO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcblxuICB2YXIgcHJldkl0ZW0gPSBmdW5jdGlvbiBwcmV2SXRlbSgpIHtcbiAgICB2YXIgc2VsZWN0ZWRJbmRleCA9IGdldFNlbGVjdGVkSW5kZXgoKTtcbiAgICB2YXIgcHJldkluZGV4ID0gc2VsZWN0ZWRJbmRleCAtIDE7XG4gICAgaWYgKHByZXZJbmRleCA9PT0gLTEpIHtcbiAgICAgIHByZXZJbmRleCA9IG1lbnUubGVuZ3RoIC0gMTtcbiAgICB9XG4gICAgbWVudVtzZWxlY3RlZEluZGV4XS5zZWxlY3RlZCA9IGZhbHNlO1xuICAgIG1lbnVbcHJldkluZGV4XS5zZWxlY3RlZCA9IHRydWU7XG5cbiAgICByZW5kZXJNZW51KCk7XG4gIH07XG4gIFxuICB2YXIgbmV4dEl0ZW0gPSBmdW5jdGlvbiBuZXh0SXRlbSgpIHtcbiAgICB2YXIgc2VsZWN0ZWRJbmRleCA9IGdldFNlbGVjdGVkSW5kZXgoKTtcbiAgICB2YXIgbmV4dEluZGV4ID0gc2VsZWN0ZWRJbmRleCArIDE7XG4gICAgaWYgKG5leHRJbmRleCA9PT0gbWVudS5sZW5ndGgpIHtcbiAgICAgIG5leHRJbmRleCA9IDA7XG4gICAgfVxuICAgIG1lbnVbc2VsZWN0ZWRJbmRleF0uc2VsZWN0ZWQgPSBmYWxzZTtcbiAgICBtZW51W25leHRJbmRleF0uc2VsZWN0ZWQgPSB0cnVlO1xuXG4gICAgcmVuZGVyTWVudSgpO1xuICB9O1xuXG4gIHZhciBhY3RpdmF0ZUl0ZW0gPSBmdW5jdGlvbiBhY3RpdmF0ZUl0ZW0oKSB7XG4gICAgaWYgKCFtZW51LmlzT3Blbikge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBpdGVtID0gZ2V0U2VsZWN0ZWRJdGVtKCk7XG4gICAgaXRlbS5hY3Rpb24oKTtcbiAgfTtcblxuICB2YXIgcmVuZGVyTWVudSA9IGZ1bmN0aW9uIHJlbmRlck1lbnUoKSB7XG4gICAgbWVudS5mb3JFYWNoKGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgIGlmIChpdGVtLnNlbGVjdGVkKSB7XG4gICAgICAgIGl0ZW0udGV4dC5zZXRTdHlsZShmb250SGlnaGxpZ2h0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGl0ZW0udGV4dC5zZXRTdHlsZShmb250Tm9ybWFsKTtcbiAgICAgIH1cbiAgICAgIHZhciB0ZXh0ID0gaXRlbS5uYW1lICsgKGl0ZW0uc2V0dGluZyA/ICc6ICcgKyBpdGVtLnNldHRpbmcuc2VsZWN0ZWQudG9TdHJpbmcoKSA6ICcnKTsgLy8gVE9ETzogd2h5IHdvbid0IHRoaXMgZGlzcGxheSBudW1lcmljIHNldHRpbmdzP1xuICAgICAgaXRlbS50ZXh0LnNldFRleHQodGV4dCk7XG4gICAgfSk7XG4gIH07XG5cbiAgdmFyIGN5Y2xlU2V0dGluZyA9IGZ1bmN0aW9uIGN5Y2xlU2V0dGluZygpIHtcbiAgICB2YXIgb3B0aW9uSW5kZXggPSB0aGlzLnNldHRpbmcub3B0aW9ucy5pbmRleE9mKHRoaXMuc2V0dGluZy5zZWxlY3RlZCk7XG4gICAgb3B0aW9uSW5kZXgrKztcbiAgICBpZiAob3B0aW9uSW5kZXggPT09IHRoaXMuc2V0dGluZy5vcHRpb25zLmxlbmd0aCkge1xuICAgICAgb3B0aW9uSW5kZXggPSAwO1xuICAgIH1cbiAgICB0aGlzLnNldHRpbmcuc2VsZWN0ZWQgPSB0aGlzLnNldHRpbmcub3B0aW9uc1tvcHRpb25JbmRleF07XG4gICAgcmVuZGVyTWVudSgpO1xuICAgIHJlc3RhcnQoKTtcbiAgfTtcblxuICB2YXIgbWVudSA9IFt7XG4gICAgbmFtZTogJ1BsYXllcnMnLFxuICAgIHNldHRpbmc6IHNldHRpbmdzLnBsYXllckNvdW50LFxuICAgIGFjdGlvbjogY3ljbGVTZXR0aW5nLFxuICAgIHNlbGVjdGVkOiB0cnVlXG4gIH0sIHtcbiAgICBuYW1lOiAnQkdNJyxcbiAgICBzZXR0aW5nOiBzZXR0aW5ncy5iZ20sXG4gICAgYWN0aW9uOiBjeWNsZVNldHRpbmdcbiAgfSwge1xuICAgIG5hbWU6ICdTdGFnZScsXG4gICAgc2V0dGluZzogc2V0dGluZ3Muc3RhZ2UsXG4gICAgYWN0aW9uOiBjeWNsZVNldHRpbmdcbiAgfSwge1xuICAgIG5hbWU6ICdTdGFydCcsXG4gICAgYWN0aW9uOiBmdW5jdGlvbigpIHtcbiAgICAgIHJlc3RhcnQoKTtcbiAgICAgIHRvZ2dsZU1lbnUoKTtcbiAgICB9XG4gIH1dLm1hcChmdW5jdGlvbihpdGVtLCBpKSB7XG4gICAgaXRlbS50ZXh0ID0gZ2FtZS5hZGQudGV4dCgwLCAwLCAnJyk7XG4gICAgaXRlbS50ZXh0LnNldFRleHRCb3VuZHMoMCwgaSAqIGl0ZW1IZWlnaHQsIGdhbWUud2lkdGgsIGdhbWUuaGVpZ2h0KTtcbiAgICByZXR1cm4gaXRlbTtcbiAgfSk7XG4gIG1lbnUuaXNPcGVuID0gdHJ1ZTtcblxuICAvLyBnYW1lcGFkIGNvbnRyb2xzXG4gIGlmIChnYW1lLmlucHV0LmdhbWVwYWQuc3VwcG9ydGVkICYmIGdhbWUuaW5wdXQuZ2FtZXBhZC5hY3RpdmUgJiYgZ2FtZS5pbnB1dC5nYW1lcGFkLnBhZDEuY29ubmVjdGVkKSB7XG4gICAgdmFyIHN0YXJ0QnV0dG9uID0gZ2FtZXBhZC5nZXRCdXR0b24oUGhhc2VyLkdhbWVwYWQuWEJPWDM2MF9TVEFSVCk7XG4gICAgdmFyIGRvd25CdXR0b24gPSBnYW1lcGFkLmdldEJ1dHRvbihQaGFzZXIuR2FtZXBhZC5YQk9YMzYwX0RQQURfRE9XTik7XG4gICAgdmFyIHVwQnV0dG9uID0gZ2FtZXBhZC5nZXRCdXR0b24oUGhhc2VyLkdhbWVwYWQuWEJPWDM2MF9EUEFEX1VQKTtcbiAgICB2YXIgc2VsZWN0QnV0dG9uID0gZ2FtZXBhZC5nZXRCdXR0b24oUGhhc2VyLkdhbWVwYWQuWEJPWDM2MF9BKTtcblxuICAgIHN0YXJ0QnV0dG9uLm9uRG93bi5hZGQodG9nZ2xlTWVudSk7XG4gICAgZG93bkJ1dHRvbi5vbkRvd24uYWRkKG5leHRJdGVtKTtcbiAgICB1cEJ1dHRvbi5vbkRvd24uYWRkKHByZXZJdGVtKTtcbiAgICBzZWxlY3RCdXR0b24ub25Eb3duLmFkZChhY3RpdmF0ZUl0ZW0pO1xuICB9XG5cbiAgLy9rZXlib2FyZCBjb250cm9sc1xuICAvLyBUT0RPOiB1cGRhdGUgbWVudSBzeXN0ZW0gdG8gaGFuZGxlIFJJR0hUIGFzIGFjdGl2YXRlIGFuZCBMRUZUIGFzIGFjdGl2ZSBpbiByZXZlcnNlXG4gIC8vIGUuZy4gbGVmdCBpbmNyZWFzZXMgcGxheWVyIGNvdW50LCByaWdodCBkZWNyZWFzZXMgaXRcbiAgZ2FtZS5pbnB1dC5rZXlib2FyZC5hZGRLZXkoUGhhc2VyLktleWJvYXJkLkVOVEVSKS5vbkRvd24uYWRkKHRvZ2dsZU1lbnUpO1xuICBnYW1lLmlucHV0LmtleWJvYXJkLmFkZEtleShQaGFzZXIuS2V5Ym9hcmQuRE9XTikub25Eb3duLmFkZChuZXh0SXRlbSk7XG4gIGdhbWUuaW5wdXQua2V5Ym9hcmQuYWRkS2V5KFBoYXNlci5LZXlib2FyZC5VUCkub25Eb3duLmFkZChwcmV2SXRlbSk7XG4gIGdhbWUuaW5wdXQua2V5Ym9hcmQuYWRkS2V5KFBoYXNlci5LZXlib2FyZC5TUEFDRUJBUikub25Eb3duLmFkZChhY3RpdmF0ZUl0ZW0pO1xuXG4gIHJlbmRlck1lbnUoKTtcbiAgcmV0dXJuIG1lbnU7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGJ1aWxkTWVudTtcbiIsInZhciBjcmVhdGVQbGF5ZXIgPSBmdW5jdGlvbiBjcmVhdGVQbGF5ZXIoZ2FtZSwgb3B0aW9ucywgb25EZWF0aCkge1xuICB2YXIgZGVmYXVsdHMgPSB7XG4gICAgcG9zaXRpb246IHtcbiAgICAgIHg6IDQsXG4gICAgICB5OiA4XG4gICAgfSxcbiAgICBvcmllbnRhdGlvbjogJ3JpZ2h0JyxcbiAgICBrZXlzOiB7XG4gICAgICB1cDogJ1VQJyxcbiAgICAgIGRvd246ICdET1dOJyxcbiAgICAgIGxlZnQ6ICdMRUZUJyxcbiAgICAgIHJpZ2h0OiAnUklHSFQnLFxuICAgICAgYXR0YWNrOiAnU0hJRlQnXG4gICAgfSxcbiAgICBzY2FsZToge1xuICAgICAgeDogNCxcbiAgICAgIHk6IDhcbiAgICB9LFxuICAgIGNvbG9yOiAncGluaycsXG4gICAgZ2FtZXBhZDogZ2FtZS5pbnB1dC5nYW1lcGFkLnBhZDEsXG4gIH07XG5cbiAgdmFyIHNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgZGVmYXVsdHMsIG9wdGlvbnMpO1xuXG4gIHZhciBrZXlzID0ge1xuICAgIHVwOiBnYW1lLmlucHV0LmtleWJvYXJkLmFkZEtleShQaGFzZXIuS2V5Ym9hcmRbc2V0dGluZ3Mua2V5cy51cF0pLFxuICAgIGRvd246IGdhbWUuaW5wdXQua2V5Ym9hcmQuYWRkS2V5KFBoYXNlci5LZXlib2FyZFtzZXR0aW5ncy5rZXlzLmRvd25dKSxcbiAgICBsZWZ0OiBnYW1lLmlucHV0LmtleWJvYXJkLmFkZEtleShQaGFzZXIuS2V5Ym9hcmRbc2V0dGluZ3Mua2V5cy5sZWZ0XSksXG4gICAgcmlnaHQ6IGdhbWUuaW5wdXQua2V5Ym9hcmQuYWRkS2V5KFBoYXNlci5LZXlib2FyZFtzZXR0aW5ncy5rZXlzLnJpZ2h0XSksXG4gICAgYXR0YWNrOiBnYW1lLmlucHV0LmtleWJvYXJkLmFkZEtleShQaGFzZXIuS2V5Ym9hcmRbc2V0dGluZ3Mua2V5cy5hdHRhY2tdKSxcbiAgfTtcblxuICB2YXIgZ2FtZXBhZCA9IHNldHRpbmdzLmdhbWVwYWQ7XG5cbiAgdmFyIHNmeCA9IHJlcXVpcmUoJy4vc2Z4LmpzJyk7XG5cbiAgdmFyIGFjdGlvbnMgPSB7XG4gICAgYXR0YWNrOiBmdW5jdGlvbiBhdHRhY2soKSB7XG4gICAgICB2YXIgZHVyYXRpb24gPSAyMDA7XG4gICAgICB2YXIgaW50ZXJ2YWwgPSA0MDA7XG4gICAgICB2YXIgdmVsb2NpdHkgPSAyMDA7XG5cbiAgICAgIHZhciBjYW5BdHRhY2sgPSAoRGF0ZS5ub3coKSA+IHBsYXllci5sYXN0QXR0YWNrZWQgKyBpbnRlcnZhbCkgJiYgIXBsYXllci5pc0R1Y2tpbmcgJiYgIXBsYXllci5pc0RlYWQ7XG4gICAgICBpZiAoIWNhbkF0dGFjaykge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHBsYXllci5pc0F0dGFja2luZyA9IHRydWU7XG4gICAgICBwbGF5ZXIubGFzdEF0dGFja2VkID0gRGF0ZS5ub3coKTtcblxuICAgICAgc2Z4LmF0dGFjaygpO1xuXG4gICAgICBzd2l0Y2gocGxheWVyLm9yaWVudGF0aW9uKSB7XG4gICAgICAgIGNhc2UgJ2xlZnQnOlxuICAgICAgICAgIHBsYXllci5ib2R5LnZlbG9jaXR5LnggPSAtdmVsb2NpdHk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3JpZ2h0JzpcbiAgICAgICAgICBwbGF5ZXIuYm9keS52ZWxvY2l0eS54ID0gdmVsb2NpdHk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIHBsYXllci5sb2FkVGV4dHVyZSgnd2hpdGUnKTtcbiAgICAgIHNldFRpbWVvdXQoYWN0aW9ucy5lbmRBdHRhY2ssIGR1cmF0aW9uKTtcbiAgICB9LFxuXG4gICAgZW5kQXR0YWNrOiBmdW5jdGlvbiBlbmRBdHRhY2soKSB7XG4gICAgICBpZiAocGxheWVyLmlzQXR0YWNraW5nKSB7XG4gICAgICAgIHBsYXllci5sb2FkVGV4dHVyZShzZXR0aW5ncy5jb2xvcik7XG4gICAgICAgIHBsYXllci5pc0F0dGFja2luZyA9IGZhbHNlO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICBydW46IGZ1bmN0aW9uIHJ1bihkaXJlY3Rpb24pIHtcbiAgICAgIHZhciBtYXhTcGVlZCA9IDY0O1xuICAgICAgdmFyIGFjY2VsZXJhdGlvbiA9IHBsYXllci5ib2R5LnRvdWNoaW5nLmRvd24gPyA4IDogMzsgLy8gcGxheWVycyBoYXZlIGxlc3MgY29udHJvbCBpbiB0aGUgYWlyXG4gICAgICBwbGF5ZXIub3JpZW50YXRpb24gPSBkaXJlY3Rpb247XG5cbiAgICAgIHN3aXRjaCAoZGlyZWN0aW9uKSB7XG4gICAgICAgIGNhc2UgJ2xlZnQnOlxuICAgICAgICAgIC8vIGlmIHBsYXllciBpcyBnb2luZyBmYXN0ZXIgdGhhbiBtYXggcnVubmluZyBzcGVlZCAoZHVlIHRvIGF0dGFjaywgZXRjKSwgc2xvdyB0aGVtIGRvd24gb3ZlciB0aW1lXG4gICAgICAgICAgaWYgKHBsYXllci5ib2R5LnZlbG9jaXR5LnggPCAtbWF4U3BlZWQpIHtcbiAgICAgICAgICAgIHBsYXllci5ib2R5LnZlbG9jaXR5LnggKz0gYWNjZWxlcmF0aW9uO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwbGF5ZXIuYm9keS52ZWxvY2l0eS54ID0gTWF0aC5tYXgocGxheWVyLmJvZHkudmVsb2NpdHkueCAtIGFjY2VsZXJhdGlvbiwgLW1heFNwZWVkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3JpZ2h0JzpcbiAgICAgICAgICBpZiAocGxheWVyLmJvZHkudmVsb2NpdHkueCA+IG1heFNwZWVkKSB7XG4gICAgICAgICAgICBwbGF5ZXIuYm9keS52ZWxvY2l0eS54IC09IGFjY2VsZXJhdGlvbjtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGxheWVyLmJvZHkudmVsb2NpdHkueCA9IE1hdGgubWluKHBsYXllci5ib2R5LnZlbG9jaXR5LnggKyBhY2NlbGVyYXRpb24sIG1heFNwZWVkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG5cbiAgICAgIGFjdGlvbnMub3JpZW50SGVhcnRzKGRpcmVjdGlvbik7XG4gICAgfSxcbiAgICBcbiAgICAvLyBUT0RPOiBmaXggbGVmdCBoZWFydHMgcG9zaXRpb24gd2hlbiBocCBpcyBsZXNzIHRoYW4gbWF4XG4gICAgb3JpZW50SGVhcnRzOiBmdW5jdGlvbiBvcmllbnRIZWFydHMoZGlyZWN0aW9uKSB7XG4gICAgICB2YXIgaGVhcnREaXN0YW5jZSA9IDEuMTsgLy8gaG93IGNsb3NlIGhlYXJ0cyBmbG9hdCBieSBwbGF5ZXJcbiAgICAgIHN3aXRjaCAoZGlyZWN0aW9uKSB7XG4gICAgICAgIGNhc2UgJ2xlZnQnOlxuICAgICAgICAgIHBsYXllci5oZWFydHMuYW5jaG9yLnNldFRvKC1oZWFydERpc3RhbmNlLCAwKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAncmlnaHQnOlxuICAgICAgICAgIHBsYXllci5oZWFydHMuYW5jaG9yLnNldFRvKGhlYXJ0RGlzdGFuY2UsIDApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH0sXG5cbiAgICBqdW1wOiBmdW5jdGlvbiBqdW1wKCkge1xuICAgICAgaWYgKHBsYXllci5ib2R5LnRvdWNoaW5nLmRvd24pIHtcbiAgICAgICAgcGxheWVyLmJvZHkudmVsb2NpdHkueSA9IC0yMDA7XG4gICAgICAgIHNmeC5qdW1wKCk7XG4gICAgICAvLyB3YWxsIGp1bXBzXG4gICAgICB9IGVsc2UgaWYgKHBsYXllci5ib2R5LnRvdWNoaW5nLmxlZnQpIHtcbiAgICAgICAgcGxheWVyLmJvZHkudmVsb2NpdHkueSA9IC0yNDA7XG4gICAgICAgIHBsYXllci5ib2R5LnZlbG9jaXR5LnggPSA5MDtcbiAgICAgICAgc2Z4Lmp1bXAoKTtcbiAgICAgIH0gZWxzZSBpZiAocGxheWVyLmJvZHkudG91Y2hpbmcucmlnaHQpIHtcbiAgICAgICAgcGxheWVyLmJvZHkudmVsb2NpdHkueSA9IC0yNDA7XG4gICAgICAgIHBsYXllci5ib2R5LnZlbG9jaXR5LnggPSAtOTA7XG4gICAgICAgIHNmeC5qdW1wKCk7XG4gICAgICB9XG4gICAgfSxcblxuICAgIGRhbXBlbkp1bXA6IGZ1bmN0aW9uIGRhbXBlbkp1bXAoKSB7XG4gICAgICAvLyBzb2Z0ZW4gdXB3YXJkIHZlbG9jaXR5IHdoZW4gcGxheWVyIHJlbGVhc2VzIGp1bXAga2V5XG4gICAgICAgIHZhciBkYW1wZW5Ub1BlcmNlbnQgPSAwLjU7XG5cbiAgICAgICAgaWYgKHBsYXllci5ib2R5LnZlbG9jaXR5LnkgPCAwKSB7XG4gICAgICAgICAgcGxheWVyLmJvZHkudmVsb2NpdHkueSAqPSBkYW1wZW5Ub1BlcmNlbnQ7XG4gICAgICAgIH1cbiAgICB9LFxuXG4gICAgZHVjazogZnVuY3Rpb24gZHVjaygpIHtcbiAgICAgIGlmIChwbGF5ZXIuaXNBdHRhY2tpbmcgfHwgcGxheWVyLmlzRGVhZCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmICghcGxheWVyLmlzRHVja2luZykge1xuICAgICAgICBwbGF5ZXIuc2NhbGUuc2V0VG8oc2V0dGluZ3Muc2NhbGUueCwgc2V0dGluZ3Muc2NhbGUueSAvIDIpO1xuICAgICAgICBwbGF5ZXIueSArPSBzZXR0aW5ncy5zY2FsZS55O1xuICAgICAgfVxuICAgICAgcGxheWVyLmlzRHVja2luZyA9IHRydWU7XG5cbiAgICAgIChmdW5jdGlvbiByb2xsKCkge1xuICAgICAgICB2YXIgY2FuUm9sbCA9IE1hdGguYWJzKHBsYXllci5ib2R5LnZlbG9jaXR5LngpID4gNTAgJiYgcGxheWVyLmJvZHkudG91Y2hpbmcuZG93bjtcbiAgICAgICAgaWYgKGNhblJvbGwpIHtcbiAgICAgICAgICBwbGF5ZXIuaXNSb2xsaW5nID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfSgpKTtcbiAgICB9LFxuXG4gICAgc3RhbmQ6IGZ1bmN0aW9uIHN0YW5kKCkge1xuICAgICAgcGxheWVyLnkgLT0gc2V0dGluZ3Muc2NhbGUueTtcbiAgICAgIHBsYXllci5zY2FsZS5zZXRUbyhzZXR0aW5ncy5zY2FsZS54LCBzZXR0aW5ncy5zY2FsZS55KTtcbiAgICAgIHBsYXllci5pc0R1Y2tpbmcgPSBmYWxzZTtcbiAgICAgIHBsYXllci5pc1JvbGxpbmcgPSBmYWxzZTtcbiAgICB9LFxuXG4gICAgdGFrZURhbWFnZTogZnVuY3Rpb24gdGFrZURhbWFnZShhbW91bnQpIHtcbiAgICAgIC8vIHByZXZlbnQgdGFraW5nIG1vcmUgZGFtYWdlIHRoYW4gaHAgcmVtYWluaW5nIGluIGEgY3VycmVudCBoZWFydFxuICAgICAgaWYgKGFtb3VudCA+IDEgJiYgKHBsYXllci5ocCAtIGFtb3VudCkgJSAyICE9PSAwKSB7XG4gICAgICAgIGFtb3VudCA9IDE7XG4gICAgICB9XG5cbiAgICAgIHBsYXllci5ocCAtPSBhbW91bnQ7XG5cbiAgICAgIGlmIChwbGF5ZXIuaHAgPCAwKSB7XG4gICAgICAgIHBsYXllci5ocCA9IDA7XG4gICAgICB9XG4gICAgICBpZiAocGxheWVyLmhwICUgMiA9PT0gMCkge1xuICAgICAgICBhY3Rpb25zLmRpZSgpO1xuICAgICAgfVxuICAgICAgYWN0aW9ucy51cGRhdGVIZWFydHMoKTtcbiAgICB9LFxuXG4gICAgdXBkYXRlSGVhcnRzOiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBoZWFsdGhQZXJjZW50YWdlID0gcGxheWVyLmhwIC8gcGxheWVyLm1heEhwO1xuICAgICAgdmFyIGNyb3BXaWR0aCA9IE1hdGguY2VpbChoZWFsdGhQZXJjZW50YWdlICogaGVhcnRzV2lkdGgpO1xuICAgICAgdmFyIGNyb3BSZWN0ID0gbmV3IFBoYXNlci5SZWN0YW5nbGUoMCwgMCwgY3JvcFdpZHRoLCBwbGF5ZXIuaGVhcnRzLmhlaWdodCk7XG4gICAgICBwbGF5ZXIuaGVhcnRzLmNyb3AoY3JvcFJlY3QpO1xuICAgIH0sXG5cbiAgICBkaWU6IGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKHBsYXllci5pc0RlYWQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBzZnguZGllKCk7XG5cbiAgICAgIGlmIChwbGF5ZXIuaHAgPiAwKSB7XG4gICAgICAgIGFjdGlvbnMuZW5kQXR0YWNrKCk7XG4gICAgICAgIHBsYXllci5sYXN0QXR0YWNrZWQgPSAwO1xuXG4gICAgICAgIHZhciByZXNwYXduUG9zaXRpb24gPSB7XG4gICAgICAgICAgeDogTWF0aC5yYW5kb20oKSA+IDAuNSA/IDQgOiAzMDYsXG4gICAgICAgICAgeTogOFxuICAgICAgICB9O1xuXG4gICAgICAgIHBsYXllci5wb3NpdGlvbi54ID0gcmVzcGF3blBvc2l0aW9uLng7XG4gICAgICAgIHBsYXllci5wb3NpdGlvbi55ID0gcmVzcGF3blBvc2l0aW9uLnk7XG4gICAgICAgIHBsYXllci5ib2R5LnZlbG9jaXR5LnggPSAwO1xuICAgICAgICBwbGF5ZXIuYm9keS52ZWxvY2l0eS55ID0gMDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBsYXllci5pc0RlYWQgPSB0cnVlO1xuICAgICAgICAvLyBrbm9jayBwbGF5ZXIgb24gaGlzL2hlciBzaWRlXG4gICAgICAgIHBsYXllci5zY2FsZS5zZXRUbyhzZXR0aW5ncy5zY2FsZS55LCBzZXR0aW5ncy5zY2FsZS54KTtcbiAgICAgICAgLy8gVE9ETzogdGhpcyBjb3VsZCBwcm9iYWJseSBiZSBiZXR0ZXIgYXJjaGl0ZWN0ZWRcbiAgICAgICAgb25EZWF0aCgpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICB2YXIgcGxheWVyID0gZ2FtZS5hZGQuc3ByaXRlKHNldHRpbmdzLnBvc2l0aW9uLngsIHNldHRpbmdzLnBvc2l0aW9uLnksIHNldHRpbmdzLmNvbG9yKTtcbiAgcGxheWVyLm5hbWUgPSBzZXR0aW5ncy5uYW1lO1xuICBwbGF5ZXIub3JpZW50YXRpb24gPSBzZXR0aW5ncy5vcmllbnRhdGlvbjtcbiAgcGxheWVyLnNjYWxlLnNldFRvKHNldHRpbmdzLnNjYWxlLngsIHNldHRpbmdzLnNjYWxlLnkpOyAvLyBUT0RPOiBhZGQgZ2lhbnQgbW9kZVxuXG4gIGdhbWUucGh5c2ljcy5hcmNhZGUuZW5hYmxlKHBsYXllcik7XG4gIHBsYXllci5ib2R5LmNvbGxpZGVXb3JsZEJvdW5kcyA9IHRydWU7XG4gIHBsYXllci5ib2R5LmJvdW5jZS55ID0gMC4yOyAvLyBUT0RPOiBhbGxvdyBib3VuY2UgY29uZmlndXJhdGlvblxuICBwbGF5ZXIuYm9keS5ncmF2aXR5LnkgPSAzODA7IC8vIFRPRE86IGFsbG93IGdyYXZpdHkgY29uZmlndXJhdGlvblxuXG4gIHBsYXllci51cFdhc0Rvd24gPSBmYWxzZTsgLy8gdHJhY2sgaW5wdXQgY2hhbmdlIGZvciB2YXJpYWJsZSBqdW1wIGhlaWdodFxuICBwbGF5ZXIuaXNSb2xsaW5nID0gZmFsc2U7XG4gIHBsYXllci5pc0R1Y2tpbmcgPSBmYWxzZTtcbiAgcGxheWVyLmlzQXR0YWNraW5nID0gZmFsc2U7XG4gIHBsYXllci5pc0RlYWQgPSBmYWxzZTtcbiAgcGxheWVyLmxhc3RBdHRhY2tlZCA9IDA7XG4gIHBsYXllci5pc0NvbGxpZGFibGUgPSB0cnVlO1xuXG4gIHBsYXllci5hY3Rpb25zID0gYWN0aW9ucztcblxuICAvLyB0cmFjayBoZWFsdGhcbiAgcGxheWVyLmhwID0gcGxheWVyLm1heEhwID0gNjsgLy8gVE9ETzogYWxsb3cgc2V0dGluZyBjdXN0b20gaHAgYW1vdW50IGZvciBlYWNoIHBsYXllclxuICBwbGF5ZXIuaGVhcnRzID0gZ2FtZS5hZGQuc3ByaXRlKDAsIDAsICdoZWFydHMnKTtcbiAgdmFyIGhlYXJ0c1dpZHRoID0gcGxheWVyLmhlYXJ0cy53aWR0aDtcbiAgcGxheWVyLmhlYXJ0cy5zZXRTY2FsZU1pbk1heCgxLCAxKTsgLy8gcHJldmVudCBoZWFydHMgc2NhbGluZyB3LyBwbGF5ZXJcbiAgdmFyIGJvYiA9IHBsYXllci5oZWFydHMuYW5pbWF0aW9ucy5hZGQoJ2JvYicsIFswLDEsMiwxXSwgMywgdHJ1ZSk7IC8vIG5hbWUsIGZyYW1lcywgZnJhbWVyYXRlLCBsb29wXG4gIHBsYXllci5oZWFydHMuYW5pbWF0aW9ucy5wbGF5KCdib2InKTtcbiAgcGxheWVyLmFkZENoaWxkKHBsYXllci5oZWFydHMpO1xuICBhY3Rpb25zLm9yaWVudEhlYXJ0cyhwbGF5ZXIub3JpZW50YXRpb24pO1xuXG4gIC8vIHBoYXNlciBhcHBhcmVudGx5IGF1dG9tYXRpY2FsbHkgY2FsbHMgYW55IGZ1bmN0aW9uIG5hbWVkIHVwZGF0ZSBhdHRhY2hlZCB0byBhIHNwcml0ZSFcbiAgcGxheWVyLnVwZGF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgIC8vIGtpbGwgcGxheWVyIGlmIGhlIGZhbGxzIG9mZiB0aGUgc2NyZWVuXG4gICAgaWYgKHBsYXllci5wb3NpdGlvbi55ID4gMTgwICYmIHBsYXllci5ocCAhPT0gMCkgeyAvLyBUT0RPOiBob3cgdG8gYWNjZXNzIG5hdGl2ZSBoZWlnaHQgZnJvbSBnYW1lLmpzP1xuICAgICAgYWN0aW9ucy50YWtlRGFtYWdlKDIpO1xuICAgIH1cblxuICAgIHZhciBpbnB1dCA9IHtcbiAgICAgIGxlZnQ6ICAgKGtleXMubGVmdC5pc0Rvd24gJiYgIWtleXMucmlnaHQuaXNEb3duKSB8fFxuICAgICAgICAgICAgICAoZ2FtZXBhZC5pc0Rvd24oUGhhc2VyLkdhbWVwYWQuWEJPWDM2MF9EUEFEX0xFRlQpICYmICFnYW1lcGFkLmlzRG93bihQaGFzZXIuR2FtZXBhZC5YQk9YMzYwX0RQQURfUklHSFQpKSB8fFxuICAgICAgICAgICAgICBnYW1lcGFkLmF4aXMoUGhhc2VyLkdhbWVwYWQuWEJPWDM2MF9TVElDS19MRUZUX1gpIDwgLTAuMSB8fFxuICAgICAgICAgICAgICBnYW1lcGFkLmF4aXMoUGhhc2VyLkdhbWVwYWQuWEJPWDM2MF9TVElDS19SSUdIVF9YKSA8IC0wLjEsXG4gICAgICByaWdodDogIChrZXlzLnJpZ2h0LmlzRG93biAmJiAha2V5cy5sZWZ0LmlzRG93bikgfHxcbiAgICAgICAgICAgICAgKGdhbWVwYWQuaXNEb3duKFBoYXNlci5HYW1lcGFkLlhCT1gzNjBfRFBBRF9SSUdIVCkgJiYgIWdhbWVwYWQuaXNEb3duKFBoYXNlci5HYW1lcGFkLlhCT1gzNjBfRFBBRF9MRUZUKSkgfHxcbiAgICAgICAgICAgICAgZ2FtZXBhZC5heGlzKFBoYXNlci5HYW1lcGFkLlhCT1gzNjBfU1RJQ0tfTEVGVF9YKSA+IDAuMSB8fFxuICAgICAgICAgICAgICBnYW1lcGFkLmF4aXMoUGhhc2VyLkdhbWVwYWQuWEJPWDM2MF9TVElDS19SSUdIVF9YKSA+IDAuMSxcbiAgICAgIHVwOiAgICAga2V5cy51cC5pc0Rvd24gfHxcbiAgICAgICAgICAgICAgZ2FtZXBhZC5pc0Rvd24oUGhhc2VyLkdhbWVwYWQuWEJPWDM2MF9EUEFEX1VQKSB8fFxuICAgICAgICAgICAgICBnYW1lcGFkLmlzRG93bihQaGFzZXIuR2FtZXBhZC5YQk9YMzYwX0EpLFxuICAgICAgZG93bjogICBrZXlzLmRvd24uaXNEb3duIHx8XG4gICAgICAgICAgICAgIGdhbWVwYWQuaXNEb3duKFBoYXNlci5HYW1lcGFkLlhCT1gzNjBfRFBBRF9ET1dOKSB8fFxuICAgICAgICAgICAgICBnYW1lcGFkLmF4aXMoUGhhc2VyLkdhbWVwYWQuWEJPWDM2MF9TVElDS19MRUZUX1kpID4gMC4xIHx8XG4gICAgICAgICAgICAgIGdhbWVwYWQuYXhpcyhQaGFzZXIuR2FtZXBhZC5YQk9YMzYwX1NUSUNLX1JJR0hUX1kpID4gMC4xLFxuICAgICAgYXR0YWNrOiBrZXlzLmF0dGFjay5pc0Rvd24gfHxcbiAgICAgICAgICAgICAgZ2FtZXBhZC5qdXN0UHJlc3NlZChQaGFzZXIuR2FtZXBhZC5YQk9YMzYwX1gpIHx8XG4gICAgICAgICAgICAgIGdhbWVwYWQuanVzdFByZXNzZWQoUGhhc2VyLkdhbWVwYWQuWEJPWDM2MF9ZKSB8fFxuICAgICAgICAgICAgICBnYW1lcGFkLmp1c3RQcmVzc2VkKFBoYXNlci5HYW1lcGFkLlhCT1gzNjBfQikgfHxcbiAgICAgICAgICAgICAgZ2FtZXBhZC5qdXN0UHJlc3NlZChQaGFzZXIuR2FtZXBhZC5YQk9YMzYwX0xFRlRfQlVNUEVSKSB8fFxuICAgICAgICAgICAgICBnYW1lcGFkLmp1c3RQcmVzc2VkKFBoYXNlci5HYW1lcGFkLlhCT1gzNjBfTEVGVF9UUklHR0VSKSB8fFxuICAgICAgICAgICAgICBnYW1lcGFkLmp1c3RQcmVzc2VkKFBoYXNlci5HYW1lcGFkLlhCT1gzNjBfUklHSFRfQlVNUEVSKSB8fFxuICAgICAgICAgICAgICBnYW1lcGFkLmp1c3RQcmVzc2VkKFBoYXNlci5HYW1lcGFkLlhCT1gzNjBfUklHSFRfVFJJR0dFUiksXG4gICAgfTtcblxuICAgIGlmIChpbnB1dC5sZWZ0KSB7XG4gICAgICBhY3Rpb25zLnJ1bignbGVmdCcpO1xuICAgIH0gZWxzZSBpZiAoaW5wdXQucmlnaHQpIHtcbiAgICAgIGFjdGlvbnMucnVuKCdyaWdodCcpO1xuICAgIH0gZWxzZSBpZiAocGxheWVyLmJvZHkudG91Y2hpbmcuZG93biAmJiAhcGxheWVyLmlzUm9sbGluZykge1xuICAgICAgLy8gYXBwbHkgZnJpY3Rpb25cbiAgICAgIGlmIChNYXRoLmFicyhwbGF5ZXIuYm9keS52ZWxvY2l0eS54KSA8IDQpIHtcbiAgICAgICAgcGxheWVyLmJvZHkudmVsb2NpdHkueCAqPSAwLjU7IC8vIHF1aWNrbHkgYnJpbmcgc2xvdy1tb3ZpbmcgcGxheWVycyB0byBhIHN0b3BcbiAgICAgIH0gZWxzZSBpZiAocGxheWVyLmJvZHkudmVsb2NpdHkueCA+IDApIHtcbiAgICAgICAgcGxheWVyLmJvZHkudmVsb2NpdHkueCAtPSA0O1xuICAgICAgfSBlbHNlIGlmIChwbGF5ZXIuYm9keS52ZWxvY2l0eS54IDwgMCkge1xuICAgICAgICBwbGF5ZXIuYm9keS52ZWxvY2l0eS54ICs9IDQ7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGlucHV0LnVwKSB7XG4gICAgICBwbGF5ZXIudXBXYXNEb3duID0gdHJ1ZTtcbiAgICAgIGFjdGlvbnMuanVtcCgpO1xuICAgIH0gZWxzZSBpZiAocGxheWVyLnVwV2FzRG93bikge1xuICAgICAgcGxheWVyLnVwV2FzRG93biA9IGZhbHNlO1xuICAgICAgYWN0aW9ucy5kYW1wZW5KdW1wKCk7XG4gICAgfVxuXG4gICAgaWYgKGlucHV0LmRvd24pIHtcbiAgICAgIGFjdGlvbnMuZHVjaygpO1xuICAgIH0gZWxzZSBpZiAocGxheWVyLmlzRHVja2luZykge1xuICAgICAgYWN0aW9ucy5zdGFuZCgpO1xuICAgIH1cblxuICAgIGlmIChpbnB1dC5hdHRhY2spIHtcbiAgICAgIGFjdGlvbnMuYXR0YWNrKCk7XG4gICAgfVxuICB9O1xuXG4gIHJldHVybiBwbGF5ZXI7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZVBsYXllcjtcbiIsInZhciBzZnggPSAoZnVuY3Rpb24gc2Z4KCkge1xuICBQb2x5c3ludGggPSByZXF1aXJlKCdzdWJwb2x5Jyk7XG5cbiAgdmFyIGF1ZGlvQ3R4O1xuICBpZiAodHlwZW9mIEF1ZGlvQ29udGV4dCAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgIGF1ZGlvQ3R4ID0gbmV3IEF1ZGlvQ29udGV4dCgpO1xuICB9IGVsc2Uge1xuICAgIGF1ZGlvQ3R4ID0gbmV3IHdlYmtpdEF1ZGlvQ29udGV4dCgpO1xuICB9XG5cbiAgdmFyIHB1bHNlID0gbmV3IFBvbHlzeW50aChhdWRpb0N0eCwge1xuICAgIHdhdmVmb3JtOiAnc3F1YXJlJyxcbiAgICByZWxlYXNlOiAwLjAxLFxuICAgIG51bVZvaWNlczogNFxuICB9KTtcbiAgXG4gIGZ1bmN0aW9uIGdldE5vdyh2b2ljZSkge1xuICAgIHZhciBub3cgPSB2b2ljZS5hdWRpb0N0eC5jdXJyZW50VGltZTtcbiAgICByZXR1cm4gbm93O1xuICB9O1xuICBcbiAgdmFyIGp1bXBUaW1lb3V0LCBhdHRhY2tUaW1lb3V0O1xuICB2YXIgZGllVGltZW91dHMgPSBbXTtcblxuICB2YXIgc291bmRFZmZlY3RzID0ge1xuICAgIGp1bXA6IGZ1bmN0aW9uKCkge1xuICAgICAgY2xlYXJUaW1lb3V0KGp1bXBUaW1lb3V0KTtcbiAgICAgIFxuICAgICAgdmFyIHZvaWNlID0gcHVsc2Uudm9pY2VzWzBdO1xuICAgICAgdmFyIGR1cmF0aW9uID0gMC4xOyAvLyBpbiBzZWNvbmRzXG4gICAgICBcbiAgICAgIHZvaWNlLnBpdGNoKDQ0MCk7XG4gICAgICB2b2ljZS5zdGFydCgpO1xuXG4gICAgICB2YXIgbm93ID0gZ2V0Tm93KHZvaWNlKTtcbiAgICAgIHZvaWNlLm9zYy5mcmVxdWVuY3kubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoODgwLCBub3cgKyBkdXJhdGlvbik7XG4gICAgICBqdW1wVGltZW91dCA9IHNldFRpbWVvdXQodm9pY2Uuc3RvcCwgZHVyYXRpb24gKiAxMDAwKTtcbiAgICB9LFxuXG4gICAgYXR0YWNrOiBmdW5jdGlvbigpIHtcbiAgICAgIGNsZWFyVGltZW91dChhdHRhY2tUaW1lb3V0KTtcbiAgICAgIFxuICAgICAgdmFyIHZvaWNlID0gcHVsc2Uudm9pY2VzWzFdO1xuICAgICAgdmFyIGR1cmF0aW9uID0gMC4xOyAvLyBpbiBzZWNvbmRzXG4gICAgICBcbiAgICAgIHZvaWNlLnBpdGNoKDg4MCk7XG4gICAgICB2b2ljZS5zdGFydCgpO1xuXG4gICAgICB2YXIgbm93ID0gZ2V0Tm93KHZvaWNlKTtcbiAgICAgIHZvaWNlLm9zYy5mcmVxdWVuY3kubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoMCwgbm93ICsgZHVyYXRpb24pO1xuICAgICAgYXR0YWNrVGltZW91dCA9IHNldFRpbWVvdXQodm9pY2Uuc3RvcCwgZHVyYXRpb24gKiAxMDAwKTtcbiAgICB9LFxuICAgIFxuICAgIGJvdW5jZTogZnVuY3Rpb24oKSB7XG4gICAgICBjbGVhclRpbWVvdXQoYXR0YWNrVGltZW91dCk7XG4gICAgICBcbiAgICAgIHZhciB2b2ljZSA9IHB1bHNlLnZvaWNlc1syXTtcbiAgICAgIHZhciBkdXJhdGlvbiA9IDAuMTsgLy8gaW4gc2Vjb25kc1xuICAgICAgXG4gICAgICB2b2ljZS5waXRjaCg0NDApO1xuICAgICAgdm9pY2Uuc3RhcnQoKTtcblxuICAgICAgdmFyIG5vdyA9IGdldE5vdyh2b2ljZSk7XG4gICAgICB2b2ljZS5vc2MuZnJlcXVlbmN5LmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDIyMCwgbm93ICsgZHVyYXRpb24gLyAyKTtcbiAgICAgIHZvaWNlLm9zYy5mcmVxdWVuY3kubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUoNjYwLCBub3cgKyBkdXJhdGlvbik7XG4gICAgICBhdHRhY2tUaW1lb3V0ID0gc2V0VGltZW91dCh2b2ljZS5zdG9wLCBkdXJhdGlvbiAqIDEwMDApO1xuICAgIH0sXG4gICAgXG4gICAgZGllOiBmdW5jdGlvbigpIHtcbiAgICAgIHdoaWxlIChkaWVUaW1lb3V0cy5sZW5ndGgpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KGRpZVRpbWVvdXRzLnBvcCgpKTtcbiAgICAgIH1cbiAgICAgIFxuICAgICAgdmFyIHZvaWNlID0gcHVsc2Uudm9pY2VzWzNdO1xuICAgICAgdmFyIHBpdGNoZXMgPSBbNDQwLCAyMjAsIDExMF07XG4gICAgICB2YXIgZHVyYXRpb24gPSAxMDA7XG5cbiAgICAgIHZvaWNlLnN0YXJ0KCk7XG4gICAgICBcbiAgICAgIHBpdGNoZXMuZm9yRWFjaChmdW5jdGlvbihwaXRjaCwgaSkge1xuICAgICAgICBkaWVUaW1lb3V0cy5wdXNoKHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgdm9pY2UucGl0Y2gocGl0Y2gpO1xuICAgICAgICB9LCBpICogZHVyYXRpb24pKTtcbiAgICAgIH0pO1xuICAgICAgXG4gICAgICBkaWVUaW1lb3V0cy5wdXNoKHNldFRpbWVvdXQodm9pY2Uuc3RvcCwgZHVyYXRpb24gKiBwaXRjaGVzLmxlbmd0aCkpO1xuICAgIH1cbiAgfTtcbiAgXG4gIHJldHVybiBzb3VuZEVmZmVjdHM7XG59KCkpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHNmeDtcbiIsInZhciBzdGFnZUJ1aWxkZXIgPSBmdW5jdGlvbiBzdGFnZUJ1aWxkZXIoZ2FtZSkge1xuICB2YXIgc2V0dGluZ3MgPSByZXF1aXJlKCcuL2RhdGEvc2V0dGluZ3MuanMnKTtcbiAgdmFyIHN0YWdlcyA9IHJlcXVpcmUoJy4vZGF0YS9zdGFnZXMuanMnKTtcbiAgdmFyIHN0YWdlID0gc3RhZ2VzLmZpbHRlcihmdW5jdGlvbihzdGFnZSkge1xuICAgIHJldHVybiBzdGFnZS5uYW1lID09PSBzZXR0aW5ncy5zdGFnZS5zZWxlY3RlZDtcbiAgfSlbMF07XG5cbiAgZ2FtZS5zdGFnZS5iYWNrZ3JvdW5kQ29sb3IgPSBzdGFnZS5iYWNrZ3JvdW5kQ29sb3I7XG5cbiAgdmFyIGJ1aWxkUGxhdGZvcm1zID0gZnVuY3Rpb24gYnVpbGRQbGF0Zm9ybXMoKSB7XG4gICAgdmFyIHBsYXRmb3JtcyA9IGdhbWUuYWRkLmdyb3VwKCk7XG4gICAgcGxhdGZvcm1zLmVuYWJsZUJvZHkgPSB0cnVlO1xuXG4gICAgdmFyIHBsYXRmb3JtUG9zaXRpb25zID0gc3RhZ2UucGxhdGZvcm1zLnBvc2l0aW9ucztcbiAgICBwbGF0Zm9ybVBvc2l0aW9ucy5mb3JFYWNoKGZ1bmN0aW9uKHBvc2l0aW9uKSB7XG4gICAgICB2YXIgcGxhdGZvcm0gPSBwbGF0Zm9ybXMuY3JlYXRlKHBvc2l0aW9uWzBdLCBwb3NpdGlvblsxXSwgc3RhZ2UucGxhdGZvcm1zLmNvbG9yKTtcbiAgICAgIHBsYXRmb3JtLnNjYWxlLnNldFRvKDI0LCA0KTtcbiAgICAgIHBsYXRmb3JtLmJvZHkuaW1tb3ZhYmxlID0gdHJ1ZTtcbiAgICB9KTtcblxuICAgIHZhciB3YWxscyA9IFtdO1xuICAgIHdhbGxzLnB1c2gocGxhdGZvcm1zLmNyZWF0ZSgtMTYsIDMyLCBzdGFnZS5wbGF0Zm9ybXMuY29sb3IpKTtcbiAgICB3YWxscy5wdXNoKHBsYXRmb3Jtcy5jcmVhdGUoMzA0LCAzMiwgc3RhZ2UucGxhdGZvcm1zLmNvbG9yKSk7XG4gICAgd2FsbHMuZm9yRWFjaChmdW5jdGlvbih3YWxsKSB7XG4gICAgICB3YWxsLnNjYWxlLnNldFRvKDE2LCA3NCk7XG4gICAgICB3YWxsLmJvZHkuaW1tb3ZhYmxlID0gdHJ1ZTtcbiAgICB9KTtcbiAgICBcbiAgICByZXR1cm4gcGxhdGZvcm1zO1xuICB9O1xuXG4gIHZhciBidWlsZEJhY2tncm91bmRzID0gZnVuY3Rpb24gYnVpbGRCYWNrZ3JvdW5kcygpIHtcbiAgICB2YXIgYmFja2dyb3VuZHMgPSBnYW1lLmFkZC5ncm91cCgpO1xuXG4gICAgc3RhZ2UuYmFja2dyb3VuZHMuZm9yRWFjaChmdW5jdGlvbihsYXllcikge1xuICAgICAgdmFyIGJnO1xuICAgICAgaWYgKGxheWVyLnNjcm9sbGluZykge1xuICAgICAgICBiZyA9IGdhbWUuYWRkLnRpbGVTcHJpdGUoMCwgMCwgZ2FtZS53aWR0aCwgZ2FtZS5oZWlnaHQsIGxheWVyLmltYWdlKTtcbiAgICAgICAgYmFja2dyb3VuZHMubG9vcCA9IGdhbWUudGltZS5ldmVudHMubG9vcChQaGFzZXIuVGltZXIuUVVBUlRFUiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgYmcudGlsZVBvc2l0aW9uLnggLT0xO1xuICAgICAgICB9LCB0aGlzKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGJnID0gZ2FtZS5hZGQuc3ByaXRlKDAsIDAsIGxheWVyLmltYWdlKTtcbiAgICAgIH1cbiAgICAgIGJhY2tncm91bmRzLmFkZChiZyk7XG4gICAgfSk7XG4gICAgXG4gICAgcmV0dXJuIGJhY2tncm91bmRzO1xuICB9O1xuXG4gIHZhciBidWlsZEZvcmVncm91bmQgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgZm9yZWdyb3VuZCA9IGdhbWUuYWRkLnNwcml0ZSgwLCAwLCBzdGFnZS5mb3JlZ3JvdW5kKTtcbiAgICByZXR1cm4gZm9yZWdyb3VuZDtcbiAgfTtcbiAgXG4gIHJldHVybiB7XG4gICAgYnVpbGRQbGF0Zm9ybXM6IGJ1aWxkUGxhdGZvcm1zLFxuICAgIGJ1aWxkRm9yZWdyb3VuZDogYnVpbGRGb3JlZ3JvdW5kLFxuICAgIGJ1aWxkQmFja2dyb3VuZHM6IGJ1aWxkQmFja2dyb3VuZHNcbiAgfTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gc3RhZ2VCdWlsZGVyO1xuIiwidmFyIFBsYXkgPSBmdW5jdGlvbihnYW1lKSB7XG4gIHZhciBwbGF5ID0ge1xuICAgIGNyZWF0ZTogZnVuY3Rpb24gY3JlYXRlKCkge1xuICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgICBzZWxmLnNmeCA9IHJlcXVpcmUoJy4uL3NmeC5qcycpO1xuICAgICAgc2VsZi5zdWJVaSA9IGdhbWUuYWRkLmdyb3VwKCk7IC8vIHBsYWNlIHRvIGtlZXAgYW55dGhpbmcgb24tc2NyZWVuIHRoYXQncyBub3QgVUkgdG8gZGVwdGggc29ydCBiZWxvdyBVSVxuXG4gICAgICAvLyBnYW1lIG92ZXIgbWVzc2FnZVxuICAgICAgdmFyIGZvbnQgPSByZXF1aXJlKCcuLi9kYXRhL2ZvbnQuanMnKTtcbiAgICAgIHNlbGYudGV4dCA9IGdhbWUuYWRkLnRleHQoMCwgMCwgJycsIGZvbnQpO1xuICAgICAgc2VsZi50ZXh0LnNldFRleHRCb3VuZHMoMCwgMCwgZ2FtZS53aWR0aCwgZ2FtZS5oZWlnaHQpO1xuICAgICAgXG4gICAgICAvLyBtZW51XG4gICAgICB2YXIgYnVpbGRNZW51ID0gcmVxdWlyZSgnLi4vbWVudS5qcycpO1xuICAgICAgc2VsZi5tZW51ID0gYnVpbGRNZW51KGdhbWUsIHNlbGYucmVzdGFydC5iaW5kKHNlbGYpKTsgLy8gVE9ETzogY29tZSB1cCB3aXRoIGJldHRlciB3YXkgdG8gbGV0IG1lbnUgcmVzdGFydCBnYW1lXG5cbiAgICAgIHNlbGYucmVzdGFydCgpO1xuICAgICAgZ2FtZS5waHlzaWNzLnN0YXJ0U3lzdGVtKFBoYXNlci5QaHlzaWNzLkFSQ0FERSk7XG4gICAgICBnYW1lLmlucHV0LmdhbWVwYWQuc3RhcnQoKTtcbiAgICB9LFxuXG4gICAgcmVzdGFydDogZnVuY3Rpb24gcmVzdGFydCgpIHtcbiAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgIHZhciBwbGF5ZXJzID0gcmVxdWlyZSgnLi4vZGF0YS9wbGF5ZXJzLmpzJykoZ2FtZSk7XG4gICAgICB2YXIgc2V0dGluZ3MgPSByZXF1aXJlKCcuLi9kYXRhL3NldHRpbmdzJyk7XG4gICAgICB2YXIgc3RhZ2VCdWlsZGVyID0gcmVxdWlyZSgnLi4vc3RhZ2VCdWlsZGVyLmpzJykoZ2FtZSk7XG5cbiAgICAgIC8vIGRlc3Ryb3kgYW5kIHJlYnVpbGQgc3RhZ2UgYW5kIHBsYXllcnNcbiAgICAgIHZhciBkZXN0cm95R3JvdXAgPSBmdW5jdGlvbiBkZXN0cm95R3JvdXAoZ3JvdXApIHtcbiAgICAgICAgaWYgKCFncm91cCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHdoaWxlIChncm91cC5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgZ3JvdXAuY2hpbGRyZW5bMF0uZGVzdHJveSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgZ3JvdXAuZGVzdHJveSgpO1xuICAgICAgfVxuXG4gICAgICBkZXN0cm95R3JvdXAoc2VsZi5wbGF5ZXJzKTtcbiAgICAgIGRlc3Ryb3lHcm91cChzZWxmLnBsYXRmb3Jtcyk7XG4gICAgICBkZXN0cm95R3JvdXAoc2VsZi5iYWNrZ3JvdW5kcyk7XG4gICAgICAvLyBUT0RPOiB1Z2gsIGNsZWFuIHRoaXMgdXAhXG4gICAgICBpZiAoc2VsZi5iYWNrZ3JvdW5kcyAmJiBzZWxmLmJhY2tncm91bmRzLmxvb3ApIHtcbiAgICAgICAgZ2FtZS50aW1lLmV2ZW50cy5yZW1vdmUoc2VsZi5iYWNrZ3JvdW5kcy5sb29wKTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWxmLmZvcmVncm91bmQpIHtcbiAgICAgICAgc2VsZi5mb3JlZ3JvdW5kLmRlc3Ryb3koKTtcbiAgICAgIH1cblxuICAgICAgc2VsZi5wbGF0Zm9ybXMgPSBzdGFnZUJ1aWxkZXIuYnVpbGRQbGF0Zm9ybXMoKTtcbiAgICAgIHNlbGYuYmFja2dyb3VuZHMgPSBzdGFnZUJ1aWxkZXIuYnVpbGRCYWNrZ3JvdW5kcygpO1xuICAgICAgc2VsZi5zdWJVaS5hZGQoc2VsZi5wbGF0Zm9ybXMpO1xuICAgICAgc2VsZi5zdWJVaS5hZGQoc2VsZi5iYWNrZ3JvdW5kcyk7XG5cbiAgICAgIHNlbGYucGxheWVycyA9IGdhbWUuYWRkLmdyb3VwKCk7XG4gICAgICBzZWxmLnN1YlVpLmFkZChzZWxmLnBsYXllcnMpO1xuXG4gICAgICB2YXIgYWRkUGxheWVyID0gZnVuY3Rpb24gYWRkUGxheWVyKHBsYXllcikge1xuICAgICAgICB2YXIgY2hlY2tGb3JHYW1lT3ZlciA9IGZ1bmN0aW9uIGNoZWNrRm9yR2FtZU92ZXIoKSB7XG4gICAgICAgICAgaWYgKHNlbGYubWVudS5pc09wZW4pIHtcbiAgICAgICAgICAgIHJldHVybjsgLy8gd2UncmUgbm90IHJlYWxseSBwbGF5aW5nIGEgZ2FtZSB5ZXQgOikgdGhpcyBoYXMgc29tZSBwcm9ibGVtcywgdGhvdWdoLi4uXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdmFyIGFsaXZlUGxheWVycyA9IFtdO1xuICAgICAgICAgIHNlbGYucGxheWVycy5jaGlsZHJlbi5mb3JFYWNoKGZ1bmN0aW9uKHBsYXllcikge1xuICAgICAgICAgICAgaWYgKCFwbGF5ZXIuaXNEZWFkKSB7XG4gICAgICAgICAgICAgIGFsaXZlUGxheWVycy5wdXNoKHBsYXllci5uYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBpZiAoYWxpdmVQbGF5ZXJzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICAgICAgc2VsZi50ZXh0LnNldFRleHQoYWxpdmVQbGF5ZXJzWzBdICsgJyAgd2lucyFcXG5QcmVzcyBzdGFydCcpO1xuICAgICAgICAgICAgc2VsZi50ZXh0LnZpc2libGUgPSB0cnVlO1xuICAgICAgICAgICAgZ2FtZS5pbnB1dC5nYW1lcGFkLnBhZDEuZ2V0QnV0dG9uKFBoYXNlci5HYW1lcGFkLlhCT1gzNjBfU1RBUlQpLm9uRG93bi5hZGRPbmNlKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICBzZWxmLnRleHQudmlzaWJsZSA9IGZhbHNlOyAvLyBqdXN0IGhpZGVzIHRleHQgKG1lbnUgd2lsbCBvcGVuIGl0c2VsZilcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfTtcbiAgICAgICAgdmFyIGNyZWF0ZVBsYXllciA9IHJlcXVpcmUoJy4uL3BsYXllci5qcycpO1xuICAgICAgICBzZWxmLnBsYXllcnMuYWRkKGNyZWF0ZVBsYXllcihnYW1lLCBwbGF5ZXIsIGNoZWNrRm9yR2FtZU92ZXIpKTtcbiAgICAgIH07XG5cbiAgICAgIC8vcGxheWVycy5mb3JFYWNoKGFkZFBsYXllcik7XG4gICAgICBmb3IgKHZhciBpPTA7IGk8c2V0dGluZ3MucGxheWVyQ291bnQuc2VsZWN0ZWQ7IGkrKykge1xuICAgICAgICBhZGRQbGF5ZXIocGxheWVyc1tpXSk7XG4gICAgICB9XG5cbiAgICAgIHNlbGYuZm9yZWdyb3VuZCA9IHN0YWdlQnVpbGRlci5idWlsZEZvcmVncm91bmQoKTtcbiAgICAgIHNlbGYuc3ViVWkuYWRkKHNlbGYuZm9yZWdyb3VuZCk7XG4gICAgfSxcblxuICAgIHVwZGF0ZTogZnVuY3Rpb24gdXBkYXRlKCkge1xuICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgXG4gICAgICBnYW1lLnBoeXNpY3MuYXJjYWRlLmNvbGxpZGUodGhpcy5wbGF5ZXJzLCB0aGlzLnBsYXRmb3Jtcyk7XG4gICAgICAvLyBUT0RPOiBob3cgZG8gaSBkbyB0aGlzIG9uIHRoZSBwbGF5ZXIgaXRzZWxmIHdpdGhvdXQgYWNjZXNzIHRvIHBsYXllcnM/IG9yIHNob3VsZCBpIGFkZCBhIGZ0biB0byBwbGF5ZXIgYW5kIHNldCB0aGF0IGFzIHRoZSBjYj9cbiAgICAgIGdhbWUucGh5c2ljcy5hcmNhZGUuY29sbGlkZSh0aGlzLnBsYXllcnMsIHRoaXMucGxheWVycywgZnVuY3Rpb24gaGFuZGxlUGxheWVyQ29sbGlzaW9uKHBsYXllckEsIHBsYXllckIpIHtcbiAgICAgICAgIC8qIGxldCdzIG5vdCBrbm9jayBhbnlib2R5IGFyb3VuZCBpZiBzb21ldGhpbmcncyBvbiBvbmUgb2YgdGhlc2UgZHVkZXMnL2R1ZGV0dGVzJyBoZWFkcy5cbiAgICAgICAgIHByZXZlbnRzIGNhbm5vbmJhbGwgYXR0YWNrcyBhbmQgdGhlIGxpa2UsIGFuZCBhbGxvd3Mgc3RhbmRpbmcgb24gaGVhZHMuXG4gICAgICAgICBub3RlOiBzdGlsbCBuZWVkIHRvIGNvbGxpZGUgaW4gb3JkZXIgdG8gdGVzdCB0b3VjaGluZy51cCwgc28gZG9uJ3QgbW92ZSB0aGlzIHRvIGFsbG93UGxheWVyQ29sbGlzaW9uISAqL1xuICAgICAgICBpZiAocGxheWVyQS5ib2R5LnRvdWNoaW5nLnVwIHx8IHBsYXllckIuYm9keS50b3VjaGluZy51cCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHRlbXBvcmFyaWx5RGlzYWJsZUNvbGxpc2lvbihwbGF5ZXIpIHtcbiAgICAgICAgICBwbGF5ZXIuaXNDb2xsaWRhYmxlID0gZmFsc2U7XG4gICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHBsYXllci5pc0NvbGxpZGFibGUgPSB0cnVlO1xuICAgICAgICAgIH0sIDEwMCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBib3VuY2UoKSB7XG4gICAgICAgICAgc2VsZi5zZnguYm91bmNlKCk7XG5cbiAgICAgICAgICB2YXIgYm91bmNlVmVsb2NpdHkgPSAxMDA7XG4gICAgICAgICAgdmFyIHZlbG9jaXR5QSwgdmVsb2NpdHlCO1xuICAgICAgICAgIHZlbG9jaXR5QSA9IHZlbG9jaXR5QiA9IGJvdW5jZVZlbG9jaXR5O1xuICAgICAgICAgIGlmIChwbGF5ZXJBLnBvc2l0aW9uLnggPiBwbGF5ZXJCLnBvc2l0aW9uLngpIHtcbiAgICAgICAgICAgIHZlbG9jaXR5QiAqPSAtMTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmVsb2NpdHlBICo9IC0xO1xuICAgICAgICAgIH1cbiAgICAgICAgICBwbGF5ZXJBLmJvZHkudmVsb2NpdHkueCA9IHZlbG9jaXR5QTtcbiAgICAgICAgICBwbGF5ZXJCLmJvZHkudmVsb2NpdHkueCA9IHZlbG9jaXR5QjtcbiAgICAgICAgICBwbGF5ZXJBLmlzUm9sbGluZyA9IGZhbHNlO1xuICAgICAgICAgIHBsYXllckIuaXNSb2xsaW5nID0gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBmbGluZygpIHtcbiAgICAgICAgICBzZWxmLnNmeC5ib3VuY2UoKTtcblxuICAgICAgICAgIHZhciBwbGF5ZXJUb0ZsaW5nO1xuICAgICAgICAgIHZhciBwbGF5ZXJUb0xlYXZlO1xuICAgICAgICAgIGlmIChwbGF5ZXJBLmlzRHVja2luZykge1xuICAgICAgICAgICAgcGxheWVyVG9GbGluZyA9IHBsYXllckI7XG4gICAgICAgICAgICBwbGF5ZXJUb0xlYXZlID0gcGxheWVyQTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGxheWVyVG9GbGluZyA9IHBsYXllckE7XG4gICAgICAgICAgICBwbGF5ZXJUb0xlYXZlID0gcGxheWVyQjtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGVtcG9yYXJpbHlEaXNhYmxlQ29sbGlzaW9uKHBsYXllclRvRmxpbmcpO1xuICAgICAgICAgIHZhciBmbGluZ1hWZWxvY2l0eSA9IDE1MDtcbiAgICAgICAgICBpZiAocGxheWVyVG9GbGluZy5wb3NpdGlvbi54ID4gcGxheWVyVG9MZWF2ZS5wb3NpdGlvbi54KSB7XG4gICAgICAgICAgICBmbGluZ1hWZWxvY2l0eSAqPSAtMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcGxheWVyVG9GbGluZy5ib2R5LnZlbG9jaXR5LnggPSBmbGluZ1hWZWxvY2l0eTtcbiAgICAgICAgICBwbGF5ZXJUb0ZsaW5nLmJvZHkudmVsb2NpdHkueSA9IC0xNTA7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBwb3AoKSB7XG4gICAgICAgICAgc2VsZi5zZnguYm91bmNlKCk7XG5cbiAgICAgICAgICB2YXIgcGxheWVyVG9Qb3A7XG4gICAgICAgICAgaWYgKHBsYXllckEuaXNSb2xsaW5nKSB7XG4gICAgICAgICAgICBwbGF5ZXJUb1BvcCA9IHBsYXllckI7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBsYXllclRvUG9wID0gcGxheWVyQTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGVtcG9yYXJpbHlEaXNhYmxlQ29sbGlzaW9uKHBsYXllclRvUG9wKTtcbiAgICAgICAgICBwbGF5ZXJUb1BvcC5ib2R5LnZlbG9jaXR5LnkgPSAtMTUwO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGJvdGhSb2xsaW5nID0gcGxheWVyQS5pc1JvbGxpbmcgJiYgcGxheWVyQi5pc1JvbGxpbmc7XG4gICAgICAgIHZhciBib3RoU3RhbmRpbmcgPSAhcGxheWVyQS5pc0R1Y2tpbmcgJiYgIXBsYXllckIuaXNEdWNraW5nO1xuICAgICAgICB2YXIgbmVpdGhlclJvbGxpbmcgPSAhcGxheWVyQS5pc1JvbGxpbmcgJiYgIXBsYXllckIuaXNSb2xsaW5nO1xuICAgICAgICB2YXIgZWl0aGVyRHVja2luZyA9IHBsYXllckEuaXNEdWNraW5nIHx8IHBsYXllckIuaXNEdWNraW5nO1xuICAgICAgICB2YXIgZWl0aGVyUnVubmluZyA9IE1hdGguYWJzKHBsYXllckEuYm9keS52ZWxvY2l0eS54KSA+IDI4IHx8IE1hdGguYWJzKHBsYXllckIuYm9keS52ZWxvY2l0eS54KSA+PSAyODtcbiAgICAgICAgdmFyIGVpdGhlclJvbGxpbmcgPSBwbGF5ZXJBLmlzUm9sbGluZyB8fCBwbGF5ZXJCLmlzUm9sbGluZztcbiAgICAgICAgdmFyIGVpdGhlclN0YW5kaW5nID0gIXBsYXllckEuaXNEdWNraW5nIHx8ICFwbGF5ZXJCLmlzRHVja2luZztcblxuICAgICAgICBzd2l0Y2ggKHRydWUpIHtcbiAgICAgICAgICBjYXNlIGJvdGhSb2xsaW5nIHx8IGJvdGhTdGFuZGluZzpcbiAgICAgICAgICAgIGJvdW5jZSgpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBuZWl0aGVyUm9sbGluZyAmJiBlaXRoZXJSdW5uaW5nICYmIGVpdGhlckR1Y2tpbmc6XG4gICAgICAgICAgICBmbGluZygpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBlaXRoZXJSb2xsaW5nICYmIGVpdGhlclN0YW5kaW5nOlxuICAgICAgICAgICAgcG9wKCk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGlmIG9ubHkgb25lIG9mIHRoZSB0b3VjaGluZyBwbGF5ZXJzIGlzIGF0dGFja2luZy4uLlxuICAgICAgICBpZiAocGxheWVyQS5pc0F0dGFja2luZyAhPT0gcGxheWVyQi5pc0F0dGFja2luZykge1xuICAgICAgICAgIHZhciB2aWN0aW0gPSBwbGF5ZXJBLmlzQXR0YWNraW5nID8gcGxheWVyQiA6IHBsYXllckE7XG4gICAgICAgICAgaWYgKHBsYXllckEub3JpZW50YXRpb24gIT09IHBsYXllckIub3JpZW50YXRpb24pIHtcbiAgICAgICAgICAgIHZpY3RpbS5hY3Rpb25zLnRha2VEYW1hZ2UoMSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZpY3RpbS5hY3Rpb25zLnRha2VEYW1hZ2UoMik7IC8vIGF0dGFja2VkIGZyb20gYmVoaW5kIGZvciBkb3VibGUgZGFtYWdlXG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgIH0sIGZ1bmN0aW9uIGFsbG93UGxheWVyQ29sbGlzaW9uKHBsYXllckEsIHBsYXllckIpIHtcbiAgICAgICAgLy8gZG9uJ3QgYWxsb3cgY29sbGlzaW9uIGlmIGVpdGhlciBwbGF5ZXIgaXNuJ3QgY29sbGlkYWJsZS5cbiAgICAgICAgLy8gYWxzbyBkaXNhbGxvdyBpZiBwbGF5ZXIgaXMgaW4gbGltYm8gYmVsb3cgdGhlIHNjcmVlbiA6XVxuICAgICAgICBpZiAoIXBsYXllckEuaXNDb2xsaWRhYmxlIHx8ICFwbGF5ZXJCLmlzQ29sbGlkYWJsZSB8fCBwbGF5ZXJBLnBvc2l0aW9uLnkgPiBnYW1lLmhlaWdodCB8fCBwbGF5ZXJCLnBvc2l0aW9uLnkgPiBnYW1lLmhlaWdodCkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfTtcbiAgXG4gIHJldHVybiBwbGF5O1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBQbGF5O1xuIiwidmFyIFNwbGFzaCA9IGZ1bmN0aW9uKGdhbWUpIHtcbiAgdmFyIHNwbGFzaCA9IHtcbiAgICBpbml0OiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBzZnggPSByZXF1aXJlKCcuLi9zZnguanMnKTtcblxuICAgICAgLy8gaW50cm8gYW5pbWF0aW9uXG4gICAgICBzZnguanVtcCgpO1xuICAgICAgdmFyIGR1ZGUgPSBnYW1lLmFkZC5zcHJpdGUoZ2FtZS53b3JsZC5jZW50ZXJYLCAxMDAsICdwdXJwbGUnKTtcbiAgICAgIGR1ZGUuc2NhbGUuc2V0VG8oOCwgMTYpO1xuICAgICAgZ2FtZS5hZGQudHdlZW4oZHVkZSkudG8oe3k6IDB9LCAyMDAsICdMaW5lYXInKS5zdGFydCgpO1xuICAgIH0sXG5cbiAgICBwcmVsb2FkOiBmdW5jdGlvbigpIHtcbiAgICAgIC8vIGltYWdlc1xuICAgICAgZ2FtZS5sb2FkLmltYWdlKCdjbGVhcicsICdpbWFnZXMvY2xlYXIucG5nJyk7XG4gICAgICBnYW1lLmxvYWQuaW1hZ2UoJ3doaXRlJywgJ2ltYWdlcy93aGl0ZS5wbmcnKTtcbiAgICAgIGdhbWUubG9hZC5pbWFnZSgncGluaycsICdpbWFnZXMvcGluay5wbmcnKTtcbiAgICAgIGdhbWUubG9hZC5pbWFnZSgneWVsbG93JywgJ2ltYWdlcy95ZWxsb3cucG5nJyk7XG4gICAgICBnYW1lLmxvYWQuaW1hZ2UoJ2JsdWUnLCAnaW1hZ2VzL2JsdWUucG5nJyk7XG4gICAgICBnYW1lLmxvYWQuaW1hZ2UoJ29yYW5nZScsICdpbWFnZXMvb3JhbmdlLnBuZycpO1xuICAgICAgZ2FtZS5sb2FkLmltYWdlKCdncmVlbicsICdpbWFnZXMvZ3JlZW4ucG5nJyk7XG5cbiAgICAgIGdhbWUubG9hZC5zcHJpdGVzaGVldCgnaGVhcnRzJywgJ2ltYWdlcy9oZWFydHMucG5nJywgOSwgNSk7IC8vIHBsYXllciBoZWFsdGhcblxuICAgICAgLy8gVE9ETzogd2h5IGRvZXNuJ3QgdGhpcyBsb2FkIGltYWdlcyBmb3IgbWU/XG4gICAgICB2YXIgc3RhZ2VzID0gcmVxdWlyZSgnLi4vZGF0YS9zdGFnZXMuanMnKTtcbiAgICAgIC8qc3RhZ2VzLmZvckVhY2goZnVuY3Rpb24oc3RhZ2UpIHtcbiAgICAgICAgdmFyIGltYWdlcyA9IFtdLmNvbmNhdChzdGFnZS5hc3NldHMuYmFja2dyb3VuZCwgc3RhZ2UuYXNzZXRzLmZvcmVncm91bmQsIHN0YWdlLmFzc2V0cy5zY3JvbGxpbmcpO1xuICAgICAgICBjb25zb2xlLmxvZygnaW1hZ2VzOicsIGltYWdlcyk7XG4gICAgICAgIGltYWdlcy5mb3JFYWNoKGZ1bmN0aW9uKGltYWdlKSB7XG4gICAgICAgICAgZ2FtZS5sb2FkLmltYWdlKGltYWdlLm5hbWUsICdpbWFnZXMvJyArIGltYWdlLm5hbWUgKyAnLnBuZycpO1xuICAgICAgICB9KTtcbiAgICAgIH0pOyovXG5cbiAgICAgIGdhbWUubG9hZC5pbWFnZSgnZ3JvdW5kJywgJ2ltYWdlcy9ncm91bmQucG5nJyk7XG4gICAgICBnYW1lLmxvYWQuaW1hZ2UoJ2ZvcmVncm91bmQnLCAnaW1hZ2VzL2ZvcmVncm91bmQucG5nJyk7XG4gICAgICBnYW1lLmxvYWQuaW1hZ2UoJ2Nsb3VkcycsICdpbWFnZXMvY2xvdWRzLnBuZycpO1xuICAgICAgZ2FtZS5sb2FkLmltYWdlKCdzdW5zJywgJ2ltYWdlcy9zdW5zLnBuZycpO1xuICAgIH0sXG5cbiAgICBjcmVhdGU6IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHN0YXJ0R2FtZSA9IGZ1bmN0aW9uIHN0YXJ0R2FtZSgpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICBpZiAoZ2FtZS5zdGF0ZS5jdXJyZW50ID09PSAnc3BsYXNoJykge1xuICAgICAgICAgIGdhbWUuc3RhdGUuc3RhcnQoJ3BsYXknKTtcbiAgICAgICAgfVxuICAgICAgfTtcbiAgICAgIFxuICAgICAgLy8gc3RhcnQgZ2FtZSBhZnRlciBhIGRlbGF5Li4uXG4gICAgICB2YXIgdGltZW91dCA9IHNldFRpbWVvdXQoc3RhcnRHYW1lLCAxMDApOyAvLyBUT0RPOiBpbmNyZWFzZSBkZWxheS4uLlxuXG4gICAgICAvLyAuLi5vciB3aGVuIHN0YXJ0L2VudGVyIGlzIHByZXNzZWRcbiAgICAgIGdhbWUuaW5wdXQua2V5Ym9hcmQuYWRkS2V5KFBoYXNlci5LZXlib2FyZC5FTlRFUikub25Eb3duLmFkZE9uY2Uoc3RhcnRHYW1lKTtcbiAgICAgIGlmIChnYW1lLmlucHV0LmdhbWVwYWQuc3VwcG9ydGVkICYmIGdhbWUuaW5wdXQuZ2FtZXBhZC5hY3RpdmUgJiYgZ2FtZS5pbnB1dC5nYW1lcGFkLnBhZDEuY29ubmVjdGVkKSB7XG4gICAgICAgIGdhbWUuaW5wdXQuZ2FtZXBhZC5wYWQxLmdldEJ1dHRvbihQaGFzZXIuR2FtZXBhZC5YQk9YMzYwX1NUQVJUKS5vbkRvd24uYWRkT25jZShzdGFydEdhbWUpO1xuICAgICAgfVxuICAgIH1cbiAgfTtcbiAgXG4gIHJldHVybiBzcGxhc2g7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFNwbGFzaDtcbiIsInZhciB1dGlscyA9IHtcbiAgLy8gZnJvbSB1bmRlcnNjb3JlXG4gIGRlYm91bmNlOiBmdW5jdGlvbiBkZWJvdW5jZShmdW5jLCB3YWl0LCBpbW1lZGlhdGUpIHtcblx0dmFyIHRpbWVvdXQ7XG5cdHJldHVybiBmdW5jdGlvbigpIHtcblx0XHR2YXIgY29udGV4dCA9IHRoaXMsIGFyZ3MgPSBhcmd1bWVudHM7XG5cdFx0dmFyIGxhdGVyID0gZnVuY3Rpb24oKSB7XG5cdFx0XHR0aW1lb3V0ID0gbnVsbDtcblx0XHRcdGlmICghaW1tZWRpYXRlKSBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuXHRcdH07XG5cdFx0dmFyIGNhbGxOb3cgPSBpbW1lZGlhdGUgJiYgIXRpbWVvdXQ7XG5cdFx0Y2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuXHRcdHRpbWVvdXQgPSBzZXRUaW1lb3V0KGxhdGVyLCB3YWl0KTtcblx0XHRpZiAoY2FsbE5vdykgZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcblx0fTtcbiAgfSxcblxuICBjZW50ZXI6IGZ1bmN0aW9uKGVudGl0eSkge1xuICAgIGVudGl0eS5hbmNob3Iuc2V0VG8oMC41KTtcbiAgfSxcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gdXRpbHM7XG4iXX0=
