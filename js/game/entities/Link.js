var ATTACK_CONE = 0.4,
    ATTACK_SENSOR_RADIUS = 18,
    USE_CONE = 0.4,
    THROW_DISTANCE_X = 75;
    THROW_DISTANCE_Y = 50,
    EFFECT_VOLUME = 0.05,
    BLOCKED_PUSH_WAIT_TIME = 800;

define([
    'game/data/types',
    'game/entities/Entity',
    'game/entities/misc/Smash'
], function(types, Entity, Smash) {
    var Link = function(spritesheet) {
        Entity.call(this, spritesheet);

        //player type
        this.type = types.ENTITY.PLAYER;

        //set name of Link
        this.name = 'link';

        //maximum maxMagic of this entity
        this.maxMagic = 10;

        //current magic of this entity
        this.magic = 10;

        //current inventory of the entity
        this.inventory = {
            sword: true,
            shield: true,
            gloves: false
        };

        //objects currently within attack range
        this.inAttackRange = [];
        this.colliding = [];

        //a pool of sprite to do smashing animations
        this.smashPool = new gf.ObjectPool(Smash, lttp.game);

        //moveSpeed the ent moves at
        this.moveSpeed = 87;

        //size
        //this.width = 16;
        //this.height = 22;

        this.movement = new gf.Vector();
        this.actions = {
            move: {},
            attack: false,
            holdAttack: false
        };
        this.sounds = {
            lift: gf.assetCache.effect_lift,
            throw: gf.assetCache.effect_throw,
            openChest: gf.assetCache.effect_open_chest
        };

        for(var s in this.sounds) {
            this.sounds[s].volume = EFFECT_VOLUME;
        }

        this.bindKeys();
        this.bindGamepad();
        this.addAnimations();

        this.anchor.x = this.anchor.y = 0.5;

        this.on('physUpdate', this._physUpdate.bind(this));

        //make the camera track this entity
        window.link = this;

        this.skipExit = false;
    };

    gf.inherits(Link, Entity, {
        bindKeys: function() {
            //bind the keyboard
            lttp.game.input.keyboard.on(gf.input.KEY.W, this.onWalk.bind(this, 'up'));
            lttp.game.input.keyboard.on(gf.input.KEY.S, this.onWalk.bind(this, 'down'));
            lttp.game.input.keyboard.on(gf.input.KEY.A, this.onWalk.bind(this, 'left'));
            lttp.game.input.keyboard.on(gf.input.KEY.D, this.onWalk.bind(this, 'right'));

            lttp.game.input.keyboard.on(gf.input.KEY.E, this.onUse.bind(this));
            lttp.game.input.keyboard.on(gf.input.KEY.SPACE, this.onAttack.bind(this));
        },
        bindGamepad: function() {
            //bind the gamepad
            lttp.game.input.gamepad.sticks.on(gf.input.GP_AXIS.LEFT_ANALOGUE_HOR, this.onGpWalk.bind(this));
            lttp.game.input.gamepad.sticks.on(gf.input.GP_AXIS.LEFT_ANALOGUE_VERT, this.onGpWalk.bind(this));
            lttp.game.input.gamepad.sticks.threshold = 0.35;

            lttp.game.input.gamepad.buttons.on(gf.input.GP_BUTTON.PAD_TOP, this.onWalk.bind(this, 'up'));
            lttp.game.input.gamepad.buttons.on(gf.input.GP_BUTTON.PAD_BOTTOM, this.onWalk.bind(this, 'down'));
            lttp.game.input.gamepad.buttons.on(gf.input.GP_BUTTON.PAD_LEFT, this.onWalk.bind(this, 'left'));
            lttp.game.input.gamepad.buttons.on(gf.input.GP_BUTTON.PAD_RIGHT, this.onWalk.bind(this, 'right'));

            lttp.game.input.gamepad.buttons.on(gf.input.GP_BUTTON.FACE_1, this.onUse.bind(this));
            lttp.game.input.gamepad.buttons.on(gf.input.GP_BUTTON.FACE_2, this.onAttack.bind(this));
            lttp.game.input.gamepad.buttons.on(gf.input.GP_BUTTON.FACE_4, this.onUseItem.bind(this));
        },
        addAnimations: function() {
            //add walking animations
            this._addDirectionalFrames('walk', 8, 0.4, true);

            //add idle shield animations
            this.addAnimation('idle_shield_left', [this.spritesheet['walk_shield_left/walk_shield_left_1.png'].frames[0]]);
            this.addAnimation('idle_shield_right', [this.spritesheet['walk_shield_right/walk_shield_right_1.png'].frames[0]]);
            this.addAnimation('idle_shield_down', [this.spritesheet['walk_shield_down/walk_shield_down_1.png'].frames[0]]);
            this.addAnimation('idle_shield_up', [this.spritesheet['walk_shield_up/walk_shield_up_1.png'].frames[0]]);

            this.addAnimation('idle_left', [this.spritesheet['walk_left/walk_left_1.png'].frames[0]]);
            this.addAnimation('idle_right', [this.spritesheet['walk_right/walk_right_1.png'].frames[0]]);
            this.addAnimation('idle_down', [this.spritesheet['walk_down/walk_down_1.png'].frames[0]]);
            this.addAnimation('idle_up', [this.spritesheet['walk_up/walk_up_1.png'].frames[0]]);

            this.addAnimation('lift_idle_left', [this.spritesheet['lift_walk_left/lift_walk_left_1.png'].frames[0]]);
            this.addAnimation('lift_idle_right', [this.spritesheet['lift_walk_right/lift_walk_right_1.png'].frames[0]]);
            this.addAnimation('lift_idle_down', [this.spritesheet['lift_walk_down/lift_walk_down_1.png'].frames[0]]);
            this.addAnimation('lift_idle_up', [this.spritesheet['lift_walk_up/lift_walk_up_1.png'].frames[0]]);

            //add attack animations
            this._addDirectionalFrames('attack', 9, 0.6);

            //add bow attack animations
            this._addDirectionalFrames('attack_bow', 3, 0.4);

            //add spin attack animations
            this._addDirectionalFrames('attack_spin', 12, 0.4);

            //add attack tap animations
            this._addDirectionalFrames('attack_tap', 3, 0.4);

            //add fall in hole animations
            this._addFrames('fall_in_hole', 4, 0.4);

            //add lifting animations
            this._addDirectionalFrames('lift', 4, 0.4);

            //add lifting walking animations
            this._addFrames(['lift_walk_left', 'lift_walk_right'], 3, 0.4, true);
            this._addFrames(['lift_walk_down', 'lift_walk_up'], 6, 0.4, true);

            //add pulling animations
            this._addDirectionalFrames('push', 5, 0.1, true);

            //add walking-attacking animations
            this._addFrames(['walk_attack_left', 'walk_attack_right'], 3, 0.4, true);
            this._addFrames(['walk_attack_down', 'walk_attack_up'], 6, 0.4, true);

            //add walking with shield animations
            this._addDirectionalFrames('walk_shield', 8, 0.4, true);

            //set active
            this.lastDir = 'down';
            this._setMoveAnimation();
            //this.gotoAndStop('idle_down');
        },
        onWalk: function(dir, e) {
            if(e.originalEvent)
                e.input.preventDefault(e.originalEvent);

            // .down is keypressed down
            if(e.down) {
                if(this.actions.move[dir]) return; //skip repeats (holding a key down)

                this.actions.move[dir] = true;
            } else {
                this.actions.move[dir] = false;
            }

            this._checkMovement();
        },
        onGpWalk: function(e) {
            var dir;
            if(e.code === gf.input.GP_AXIS.LEFT_ANALOGUE_HOR) {
                if(e.value === 0) {
                    if(!this._lastHorzGpValue)
                        return;

                    this.actions.move.left = false;
                    this.actions.move.right = false;
                } else if(e.value > 0) {
                    if(this.actions.move.right)
                        return;

                    this.actions.move.right = true;
                } else {
                    if(this.actions.move.left)
                        return;

                    this.actions.move.left = true;
                }
                this._lastHorzGpValue = e.value;
            }
            else {
                if(e.value === 0) {
                    if(!this._lastVertGpValue)
                        return;

                    this.actions.move.down = false;
                    this.actions.move.up = false;
                } else if(e.value > 0) {
                    if(this.actions.move.down)
                        return;

                    this.actions.move.down = true;
                } else {
                    if(this.actions.move.up)
                        return;

                    this.actions.move.up = true;
                }
                this._lastVertGpValue = e.value;
            }

            this._checkMovement();
        },
        //when attack key is pressed
        onAttack: function(e) {
            if(!this.inventory.sword)
                return;

            if(e.originalEvent)
                e.input.preventDefault(e.originalEvent);

            if(e.down) {
                if(this.locked || this.actions.holdAttack)
                    return;

                this.lock();
                this.actions.attack = true;
                this.actions.holdAttack = true;
                this._setAttackAnimation();
                this._checkAttack();
            } else {
                this.actions.holdAttack = false;
            }
        },
        lock: function() {
            this.setVelocity([0, 0]);
            this.locked = true;
        },
        unlock: function() {
            this._setMoveAnimation();
            this.setVelocity(this.movement);
            this.locked = false;
        },
        addAttackSensor: function(phys) {
            if(this.atkSensor) return;

            this.atkSensor = phys.addCustomShape(this, new gf.Circle(0, 0, ATTACK_SENSOR_RADIUS), true);
        },
        //Talk, run, Lift/Throw/Push/Pull
        onUse: function(status) {
            if(!status.down || this.locked)
                return;

            //throws
            if(this.carrying) {
                return this.throwItem();
            }

            //interacts with stuff
            for(var i = 0; i < this.colliding.length; ++i) {
                var e = this.colliding[i],
                    t;

                if(!e.properties)
                    continue;

                t = e.properties.type;

                if(!t)
                    continue;

                if(this._inCone(e, USE_CONE)) {
                    switch(t) {
                        case 'chest':
                            if(this.lastDir === 'up') {
                                this.openChest(e);
                            }
                            break;

                        case 'sign':
                            if(this.lastDir === 'up') {
                                this.readSign(e);
                            } else {
                                this.liftItem(e);
                            }
                            break;

                        case 'rock':
                            if(this.inventory.gloves) {
                                this.liftItem(e);
                            }
                            break;

                        case 'grass':
                        case 'pot':
                            //TODO: DO DROP
                            this.liftItem(e);
                            break;
                    }

                    //break loop
                    break;
                }
            }
        },
        //Uses the currently equipted item
        onUseItem: function() {

        },
        openChest: function(chest) {
            var loot = chest.properties.loot;

            chest.setTexture(gf.assetCache.sprite_worlditems['slice25_25.png']);
            this.sounds.openChest.play();

            //TODO: GIVE LOOT
        },
        readSign: function(sign) {

        },
        liftItem: function(item) {
            //Do lifting of the object
            this.lock();

            //change physics to sensor
            item.disablePhysics();
            item.sensor = true;
            item.enablePhysics();

            //make it on top
            item.parent.removeChild(item);
            lttp.game.world.addChild(item);

            this.gotoAndPlay('lift_' + this.lastDir);
            this.sounds.lift.play();

            var self = this;
            TweenLite.to(item.position, 0.15, {
                x: self.position.x,
                y: self.position.y - self.height + 5,
                ease: Linear.easeNone,
                onComplete: function() {
                    //set that we are carrying it
                    self.carrying = item;
                    self.unlock();
                }
            });
        },
        throwItem: function() {
            var item = this.carrying,
                v = this._getDirVector(),
                yf = v.y === -1 ? 0 : 1,
                self = this;

            this.carrying = null;
            this.sounds.throw.play();

            TweenLite.to(item.position, 0.25, {
                x: '+=' + (THROW_DISTANCE_X * v.x),
                y: '+=' + ((THROW_DISTANCE_Y * v.y) + (yf * this.height)),
                ease: Linear.easeNone,
                onCompleteParams: [item],
                onComplete: function(obj) {
                    self._destroyObject(obj);
                }
            });

            this._setMoveAnimation();
        },
        _destroyObject: function(o) {
            var t = o.properties.type,
                spr = this.smashPool.create();

            spr.gotoAndPlay(t);
            spr.visible = true;
            spr.anchor.x = o.anchor.x;
            spr.anchor.y = o.anchor.y;
            spr.setPosition(o.position.x, o.position.y);

            //TODO: drops?
            o.destroy();
        },
        _physUpdate: function() {
            if(this.carrying) {
                this.carrying.position.x = this.position.x;
                this.carrying.position.y = this.position.y - this.height + 5;
            }
        },
        _checkAttack: function() {
            for(var i = this.inAttackRange.length - 1; i > -1; --i) {
                var e = this.inAttackRange[i],
                    t = e.properties.type;

                if(t.indexOf('grass') === -1)
                    continue;

                if(this._inCone(e, ATTACK_CONE)) {
                    if(e.takeDamage) {
                        e.takeDamage(this.damage)
                    } else if(t.indexOf('grass') !== -1) {
                        this._destroyObject(e);
                    }
                }
            }
        },
        _inCone: function(obj, cone) {
            var vec = new gf.Vector(
                obj.position.x - this.position.x,
                obj.position.y - this.position.y
            );

            vec.normalize();

            //check if 'e' is withing a conic area in the direction we face
            switch(this.lastDir) {
                case 'left':
                    return (vec.x < 0 && vec.y > -cone && vec.y < cone);
                case 'right':
                    return (vec.x > 0 && vec.y > -cone && vec.y < cone);
                case 'up':
                    return (vec.y < 0 && vec.x > -cone && vec.x < cone);
                case 'down':
                    return (vec.y > 0 && vec.x > -cone && vec.x < cone);
            }
        },
        _getDirVector: function() {
            //check if 'e' is withing a conic area in the direction we face
            switch(this.lastDir) {
                case 'left':
                    return new gf.Vector(-1, 0);
                case 'right':
                    return new gf.Vector(1, 0);
                case 'up':
                    return new gf.Vector(0, -1);
                case 'down':
                    return new gf.Vector(0, 1);
            }
        },
        _checkMovement: function() {
            //doing this in an action status based way means that pressing two opposing
            //keys at once and release one will still work (like pressing left & right, then releasing right)
            if(this.actions.move.left && this.actions.move.right)
                this.movement.x = 0;
            else if(this.actions.move.left)
                this.movement.x = -this.moveSpeed;
            else if(this.actions.move.right)
                this.movement.x = this.moveSpeed;
            else
                this.movement.x = 0;

            if(this.actions.move.up && this.actions.move.down)
                this.movement.y = 0;
            else if(this.actions.move.up)
                this.movement.y = -this.moveSpeed;
            else if(this.actions.move.down)
                this.movement.y = this.moveSpeed;
            else
                this.movement.y = 0;

            if(this.locked) return;

            this._setMoveAnimation();
            this.setVelocity(this.movement);
        },
        _setMoveAnimation: function() {
            var anim = (this.movement.x || this.movement.y) ? 'walk' : 'idle';
            //clearTimeout(this._toBlockedAnim);

            if(this.carrying) {
                this._setMoveDirAnimation('lift_' + anim)
            }
            else if(this.inventory.shield) {
                this._setMoveDirAnimation(anim + '_shield');
            }
            else {
                this._setMoveDirAnimation(anim);
            }

            /*console.log(this.colliding.length, this.movement);
            if(this.colliding.length && (this.movement.x || this.movement.y)) {
                this._doBlockedAnim();
            }*/
        },
        _doBlockedAnim: function() {
            var self = this;
            this._toBlockedAnim = setTimeout(function() {
                var p = self.currentAnimation.indexOf('push') === -1 && 
                        (self.movement.x || self.movement.y) &&
                        Math.abs(self._phys.body.vx) < 0.1 &&
                        Math.abs(self._phys.body.vy) < 0.1;

                console.log(self._phys.body.vx, self._phys.body.vy);

                if(p) self.gotoAndPlay('push_' + self.lastDir);
            }, BLOCKED_PUSH_WAIT_TIME);
        },
        _setMoveDirAnimation: function(anim) {
            if(this.movement.x) {
                if(this.movement.x > 0) {
                    this.lastDir = 'right';
                    this.gotoAndPlay(anim + '_right');
                } else {
                    this.lastDir = 'left';
                    this.gotoAndPlay(anim + '_left');
                }
            }
            else if(this.movement.y) {
                if(this.movement.y > 0) {
                    this.lastDir = 'down';
                    this.gotoAndPlay(anim + '_down'); 
                } else {
                    this.lastDir = 'up';
                    this.gotoAndPlay(anim + '_up');
                }
            }
            else {
                this.gotoAndStop(anim + '_' + this.lastDir);
            }
        },
        _setAttackAnimation: function() {
            if(!this._attackAnchorMap) {
                this._attackAnchorMap = {
                    up: {
                        0: [0, 1],
                        1: [-0.05, 1],
                        2: [0.05, 1],
                        3: [0, 1],
                        6: [0.2, 1],
                        7: [0.3, 1],
                        8: [0.4, 1]
                    },
                    down: {
                        0: [0.2, 1],
                        2: [0.2, 0.95],
                        3: [0.2, 0.79],
                        4: [0.1, 0.75],
                        5: [0.1, 0.75],
                        6: [0.1, 0.75],
                        7: [0.1, 0.75],
                        8: [0.1, 0.8],
                        9: [0.1, 0.75]
                    },
                    right: {
                        0: [0, 1],
                        7: [0, 0.75],
                        8: [0, 0.7]
                    },
                    left: {
                        0: [0.5, 1],
                        7: [0.5, 0.8]
                    }
                }
            }

            var ax = this.anchor.x,
                ay = this.anchor.y,
                dir = this.lastDir,
                mp = this._attackAnchorMap[dir],
                self = this,
                frame = function(anim, fr) {
                    if(mp && mp[fr]) {
                        self.anchor.x = mp[fr][0];
                        self.anchor.y = mp[fr][1];
                    }
                };

            this.on('frame', frame);
            this.once('complete', function() {
                self.anchor.x = ax;
                self.anchor.y = ay;
                self.actions.attack = false;
                self.off('frame', frame);
                self.unlock();
            });
            this.gotoAndPlay('attack_' + dir);
        },
        //on collision
        _collide: function(obj, vec, colShape, myShape) {
            //we got into range of something to attack
            if(myShape === this.atkSensor) {
                if(obj.type === types.ENTITY.ENEMY || !obj.type) {
                    this.inAttackRange.push(obj);

                    //something new walked in while we were attacking
                    if(this.actions.attack)
                        this._checkAttack();
                }
            }
            //colliding with a new zone
            else if(obj.type === 'zone') {
                lttp.loadZone(obj, vec);
            }
            //collide with an exit
            else if(obj.type === 'exit') {
                if(this.skipExit)
                    this.skipExit = false;
                else
                    lttp.loadWorld(obj, vec);
            } else if(!obj.sensor) {
                this.colliding.push(obj);
                //this._doBlockedAnim();
            }
        },
        _separate: function(obj, colShape, myShape) {
            if(myShape === this.atkSensor) {
                var i = this.inAttackRange.indexOf(obj);

                if(i >= 0) {
                    this.inAttackRange.splice(i, 1);
                }
            } else if(!obj.sensor) {
                var i = this.colliding.indexOf(obj);

                if(i >= 0) {
                    this.colliding.splice(i, 1);
                }

                //if(!this.colliding.length)
                    //clearTimeout(this._toBlockedAnim);
            }
        }
    });

    return Link;
});