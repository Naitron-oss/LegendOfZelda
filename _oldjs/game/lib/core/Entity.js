define([
    'game/lib/bases/Sprite',
    'game/lib/utils/AssetLoader',
    'game/data/types',
    'game/lib/utils/util'
], function(Sprite, AssetLoader, types, util) {
    var Entity = Sprite.extend({
        init: function(data, engine) {
            //this.controls = controls;
            //this.map = map;
            //this.viewport = viewport;

            this.type = data.type;
            this.name = data.name;
            this.moveSpeed = data.moveSpeed || 200;
            this.maxHealth = data.maxHealth || 3;
            this.health = data.health || 3;

            this.items = data.items || [];
            this.loot = data.loot || [];

            this.sounds = data.sounds || {};

            this.lastDirection = null;

            this.jumpDownSpeed = 500;
            this.jumpDownWait = 500;

            this.blocked = { x: false, y: false };
            this.blocker = { x: null, y: null };

            this.moving = {
                up: false, down: false,
                left: false, right: false
            };

            this.canMove = data.canMove || false;

            this.ray = new THREE.Ray();

            data.sprite = data.sprite || { size: [0, 0], area: [1, 1] };

            //initialize visual sprite
            this._super(data.sprite, engine);

            if(!data.sprite.texture) {
                var loader = new AssetLoader(), self = this;

                loader.loadResource({ type: 'texture', src: data.sprite.textureSrc }, function(err, texture) {
                    if(err) console.error('BAD TEXTURE LOAD!', err);

                    self.setTexture(texture);

                    self.setAnimation('idle');
                    self.setPosition(data.location[0], data.location[1]);
                });
            } else {
                this.setAnimation('idle');
                this.setPosition(data.location[0], data.location[1]);
            }

            this.bindEvents();
        },
        bindEvents: function() {
            var self = this;

            if(this.canMove) {
                //set moving animations
                self.engine.controls.on('move::*', function(dir, startMoving) {
                    if(!self.engine.controls.isMoving) {
                        self.setAnimation('idle_' + self.lastDirection);
                        self.setAnimation();
                    }
                    else {
                        this.moving[dir] = startMoving;
                        if(this.moving.up) self.setAnimation('move_up');
                        else if(this.moving.down) self.setAnimation('move_down');
                        else if(this.moving.left) self.setAnimation('move_left');
                        else if(this.moving.right) self.setAnimation('move_right');
                    }
                });
            }
        },
        update: function(delta) {
            this._super(delta);

            if(this.freeze || !this.canMove) return;

            //calculate actual sprite movement accross the world
            var speed = delta * this.moveSpeed,
                x = 0,
                y = 0;

            //clamp speed to fix issues with collision calculations when framerate gets low
            if(speed > 0) speed = Math.min(speed, 10);
            else if(speed < 0) speed = Math.max(speed, -10);

            //these values are the inverse of the player movement, since because pickles
            if(this.moving.up) y += speed;
            if(this.moving.down) y -= speed;

            if(this.moving.left) x -= speed;
            if(this.moving.right) x += speed;

            this.checkMapCollision(delta, x, y);
            this.checkEntityCollision(x, y);

            if(x || y) this.moveEntity(x, y);
        },
        moveEntity: function(x, y) {
            if(!this.blocked.x) this._mesh.translateX(x);
            if(!this.blocked.y) this._mesh.translateY(y);
        },
        animateMoveEntity: function(x, y, speed, cb) {
            var props = {};

            if(!this.blocked.x) props.x = '+=' + x;
            if(!this.blocked.y) props.y = '+=' + y;

            this.animate(this._mesh.position, {
                duration: speed,
                props: props,
                complete: cb
            });
        },
        die: function() {
            console.log('ENTITY DIED!', this);
            var self = this;

            //remove weapon, do death animation/sounds, drop loot, and destroy
            this.weapon = null;
            this.engine.ui.playSound(this.sounds.death);
            this.setAnimation('death');

            this.once('animDone', function() {
                self.dropLoot();
                self.engine.destroyEntity(self);
            });
        },
        damage: function(dmg, knockback, dir) {
            this.health -= dmg;

            if(this.health <= 0) {
                //death of entity
                this.die();
            } else {
                var self = this;

                //free movement for the duration of damage animation
                this.freeze = true;
                this.engine.ui.playSound(this.sounds.damage);
                this.setAnimation('damage_' + dir);

                this.once('animDone', function() {
                    this.freeze = false;
                    this.setAnimation('idle' + dir);
                });

                //do knockback effect
                if(knockback) {
                    var x = 0, y = 0;

                    if(dir == 'up') y -= knockback;
                    if(dir == 'down') y += knockback;

                    if(dir == 'left') x += knockback;
                    if(dir == 'right') x -= knockback;

                    this.moveEntity(x, y);
                }
            }
        },
        checkEntityCollision: function() {
            if(!this._mesh) return;

            var origin = this._mesh.position.clone();

            //loop through each vertex of the mesh's geometry
            for(var v = 0, vl = this._mesh.geometry.vertices.length; v < vl; ++v) {
                //some calculations for each vertex
                var localV = this._mesh.geometry.vertices[v].clone(),
                    globalV = this._mesh.matrix.multiplyVector3(localV),
                    directionV = globalV.subSelf(this._mesh.position),
                    collisions = [];

                this.ray.set(origin, directionV);

                //check for a collision for each entity
                for(var e = 0, el = this.engine.entities.length; e < el; ++e) {
                    var entity = this.engine.entities[e],
                        hits = this.ray.intersectObject(entity._mesh);

                    /*for(var i = 0, il = hits.length; i < il; ++i) {
                        hits[i].entity = entity;
                        collisions.push(hits[i]);
                    }*/

                    //for now we only care about the first hit on this object
                    //that is only one per entity
                    if(hits.length) {
                        console.log('HIT! DirectionV:', entity, directionV);
                        hits[0].entity = entity;
                        hits[0].direction = 'left'; //this needs to be based on directionV
                        collisions.push(hits[0]);
                    }
                }

                //sort the collisions
                collisions.sort(function(a, b) {
                    return a.distance - b.distance;
                });

                //if any collisions
                if(collisions.length > 0 && collisions[0].distance < directionV.length()) {
                    for(var c = 0, cl = collisions.length; c < cl; ++c) {
                        var hit = collisions[c];

                        //check if this entity should take damage
                        if(hit.entity.weapon) 
                            this.damage(hit.entity.weapon.damage, hit.entity.weapon.knockback, hit.direction);
                    }
                }
            }
        },
        //the map collision checks if we were to move by X, Y units, would we collide with
        //a map element. This check is neccessary since most elements on the map are not
        //entities (walls, hills, jump downs, fences, trees, etc.) so normal entity collisions
        //won't detect these hits. Entities are only created for interactive elements of the map.
        checkMapCollision: function(delta, x, y) {
            if(!this._mesh) return;

            if(!x && !y) return;

            //if we moved by x,y would we collide with a wall or other map element?
            //if yes, set "this.blocked[axis] = true" and set the "this.blocker[axis] = tile";

            //clone our mesh and simulate movement
            var mesh = this._mesh.clone(), self = this;

            var tilemapSize = this.engine.map.tilemapSize.clone().divideScalar(2), //half tilemap size
                pos = new THREE.Vector2(mesh.position.x, mesh.position.y), //position before simulation
                posX = new THREE.Vector2(mesh.position.x + x, mesh.position.y), //simulated movement for X
                posY = new THREE.Vector2(mesh.position.x, mesh.position.y + y), //simulated movement for Y
                loc = new THREE.Vector2();

            //position is really the "origin" of the entity, it is the center point.
            //link has 4 "hot spots" that are used to detect collision:
            // - if moving left: his leftmost foot position, and leftmost center are checked
            // - if moving right: his rightmost foot position, and rightmost center are checked
            // - if moving up: his leftmost center and his rightmost center positions are checked
            // - if moving down: his leftmost foot position and his rightmost foot positions are checked

            this.blocked.x = this.blocked.y = false;
            this.blocker.x = this.blocker.y = null;

            var tilesX = [],
                tilesY = [],
                space = 10,
                rollAmt = delta * this.moveSpeed;

            //if moving along X, check that blockage
            if(x) {
                //moving left
                if(x < 0) {
                    var leftFoot = posX.clone(),
                        leftCenter = posX.clone();

                    leftFoot.x -= (this.size.x / 2) - space;
                    leftFoot.y -= (this.size.y / 2) - space;

                    leftCenter.x -= (this.size.x / 2) - space;
                    //leftCenter.y -= space * 2;

                    //get the tiles for the left foot and left center hotspots
                    lfBlock = this._getMapBlock(leftFoot, tilemapSize);
                    lcBlock = this._getMapBlock(leftCenter, tilemapSize);

                    //at upper edge, move up
                    if(!y && (lfBlock && lfBlock[0].blockType == types.SUBTILE.BLOCK) && (!lcBlock || lcBlock[0].blockType != types.SUBTILE.BLOCK)) {
                        this.moveEntity(0, rollAmt);
                    }
                    //lower edge, move down
                    else if(!y && (lcBlock && lcBlock[0].blockType == types.SUBTILE.BLOCK) && (!lfBlock || lfBlock[0].blockType != types.SUBTILE.BLOCK)) {
                        this.moveEntity(0, -rollAmt);
                    }

                    //store the blocks if they exist
                    Array.prototype.push.apply(tilesX, lfBlock);
                    Array.prototype.push.apply(tilesX, lcBlock);
                }
                //moving right
                else {
                    var rightFoot = posX.clone(),
                        rightCenter = posX.clone();

                    rightFoot.x += (this.size.x / 2) - space;
                    rightFoot.y -= (this.size.y / 2) - space;

                    rightCenter.x += (this.size.x / 2) - space;
                    //rightCenter.y -= space * 2;

                    //get the tiles for the right foot and right center hotspots
                    rfBlock = this._getMapBlock(rightFoot, tilemapSize);
                    rcBlock = this._getMapBlock(rightCenter, tilemapSize);

                    //at upper edge, move up
                    if(!y && (rfBlock && rfBlock[0].blockType == types.SUBTILE.BLOCK) && (!rcBlock || rcBlock[0].blockType != types.SUBTILE.BLOCK)) {
                        this.moveEntity(0, rollAmt);
                    }
                    //lower edge, move down
                    else if(!y && (rcBlock && rcBlock[0].blockType == types.SUBTILE.BLOCK) && (!rfBlock || rfBlock[0].blockType != types.SUBTILE.BLOCK)) {
                        this.moveEntity(0, -rollAmt);
                    }

                    //get the tiles for the right foot and right center hotspots
                    Array.prototype.push.apply(tilesX, rfBlock);
                    Array.prototype.push.apply(tilesX, rcBlock);
                }
            }

            //if moving along Y, check that blockage
            if(y) {
                //moving down
                if(y < 0) {
                    var leftFoot = posY.clone(),
                        rightFoot = posY.clone();

                    leftFoot.x -= (this.size.x / 2) - space;
                    leftFoot.y -= (this.size.y / 2) - space;

                    rightFoot.x += (this.size.x / 2) - space;
                    rightFoot.y -= (this.size.y / 2) - space;

                    //get the tiles for the right foot and right center hotspots
                    lfBlock = this._getMapBlock(leftFoot, tilemapSize);
                    rfBlock = this._getMapBlock(rightFoot, tilemapSize);

                    //at right edge, move right
                    if(!x && (lfBlock && lfBlock[0].blockType == types.SUBTILE.BLOCK) && (!rfBlock || rfBlock[0].blockType != types.SUBTILE.BLOCK)) {
                        this.moveEntity(rollAmt, 0);
                    }
                    //left edge, move left
                    else if(!x && (rfBlock && rfBlock[0].blockType == types.SUBTILE.BLOCK) && (!lfBlock || lfBlock[0].blockType != types.SUBTILE.BLOCK)) {
                        this.moveEntity(-rollAmt, 0);
                    }

                    //get the tiles for the left foot and right foot hotspots
                    Array.prototype.push.apply(tilesY, lfBlock);
                    Array.prototype.push.apply(tilesY, rfBlock);
                }
                //moving up
                else {
                    var leftCenter = posY.clone(),
                        rightCenter = posY.clone();

                    leftCenter.x -= (this.size.x / 2) - space;
                    //leftCenter.y -= space * 2;

                    rightCenter.x += (this.size.x / 2) - space;
                    //rightCenter.y -= space * 2;

                    //get the tiles for the right foot and right center hotspots
                    lcBlock = this._getMapBlock(leftCenter, tilemapSize);
                    rcBlock = this._getMapBlock(rightCenter, tilemapSize);

                    //at right edge, move right
                    if(!x && (lcBlock && lcBlock[0].blockType == types.SUBTILE.BLOCK) && (!rcBlock || rcBlock[0].blockType != types.SUBTILE.BLOCK)) {
                        this.moveEntity(rollAmt, 0);
                    }
                    //left edge, move left
                    else if(!x && (rcBlock && rcBlock[0].blockType == types.SUBTILE.BLOCK) && (!lcBlock || lcBlock[0].blockType != types.SUBTILE.BLOCK)) {
                        this.moveEntity(-rollAmt, 0);
                    }

                    //get the tiles for the left center and right center hotspots
                    Array.prototype.push.apply(tilesY, lcBlock);
                    Array.prototype.push.apply(tilesY, rcBlock);
                }
            }

            //check X tiles
            for(var z = 0, zl = tilesX.length; z < zl; ++z) {
                if(tilesX[z].blockType == types.SUBTILE.BLOCK) {
                    this.blocked.x = true;
                    this.blocker.x = tilesX[z];
                } else if(tilesX[z].blockType == types.SUBTILE.JUMPDOWN) {
                    var self = this;
                    //do jumpdown
                    //this.freeze = true;
                    this.engine.ui.playSound(this.sounds.jumpdown);
                    //this.setAnimation('jumpdown');
                    this.freeze = true;
                    this.animateMoveEntity((x > 0 ? 75 : -75), 0, this.jumpDownSpeed, function() {
                        self.freeze = false;
                    });

                    /*this.once('animDone', function() {
                        this.freeze = false;
                        this.setAnimation('idle' + dir);
                    });*/
                }
            }

            //check Y tiles
            for(var q = 0, ql = tilesY.length; q < ql; ++q) {
                if(tilesY[q].blockType == types.SUBTILE.BLOCK) {
                    this.blocked.y = true;
                    this.blocker.y = tilesY[q];
                } else if(tilesY[q].blockType == types.SUBTILE.JUMPDOWN) {
                    var self = this;
                    //do jumpdown
                    //this.freeze = true;
                    this.engine.ui.playSound(this.sounds.jumpdown);
                    //this.setAnimation('jumpdown_' + this.lastDirection);
                    this.freeze = true;
                    this.animateMoveEntity(0, (y > 0 ? 100 : -100), this.jumpDownSpeed, function() {
                        self.freeze = false;
                    });

                    /*this.once('animDone', function() {
                        this.freeze = false;
                        this.setAnimation('idle_' + this.lastDirection);
                    });*/
                }
            }
        },
        _getMapBlock: function(pos, tilemapSize, realCoords) {
            //if not realCoords, they are world coords; and must be converted
            if(!realCoords) {
                //do some division to make position be in "tiles from center" instead of "pixels from center"
                pos.divideScalar(this.engine.map.tileScale).divideScalar(this.engine.map.tileSize);

                //inverse the Y since we are getting offset from top not bottom like the position does
                pos.y = -pos.y;

                //pos is now the offset from the center, to make it from the top left
                //we subtract half the size of the tilemap
                pos.addSelf(tilemapSize);
            }

            //need to get decimals off to test which part of the tile
            //we are on
            var posd = new THREE.Vector2(pos.x - Math.floor(pos.x), pos.y - Math.floor(pos.y)),
                pixel = util.getImagePixel(this.engine.map.layers[0].imageData.tilemap, Math.floor(pos.x), Math.floor(pos.y));

            if(!pixel.blue) return;

            //texX decimal < 0.5 == left side of tile, > 0.5 == right side of tile
            //texY decimal < 0.5 == top side of tile, > 0.5 == bottom side of tile
            //
            //subtiles are a 1 byte value where 2 bits are for each subtile in the
            //order lefttop, righttop, leftbottom, rightbottom
            //to get righttop: ((pixel.a >> 4) & 3)
            var shift = 0,
                flag = 3; //binary "11" to "and" off the 2 least significant bits

            if(posd.x < 0.5) shift = [2, 6]; //shift for lefts (leftbottom, lefttop)
            else shift = [0, 4]; //shifts for rights (rightbottom, righttop)

            if(posd.y < 0.5) shift = shift[1]; //shift for top (second element)
            else shift = shift[0]; //shift for bottom (first element)

            return [{
                blockType: ((pixel.blue >> shift) & flag),
                pixel: pixel,
                pos: pos,
                posd: posd,
                shift: shift
            }];
        }
    });

    return Entity;
});