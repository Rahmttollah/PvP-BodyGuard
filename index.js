//----------------------------------------------------
// ULTRA PRO MAX PVP BOT - 20 BLOCK SPHERE TP
//----------------------------------------------------
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const pvp = require('mineflayer-pvp').plugin;
const mcDataLoader = require('minecraft-data');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const config = require('./settings.json');

// ---------------- PING ----------------
const app = express();
app.get('/', (_, res) => res.send('Bot Online'));
app.listen(8000);

// ---------------- GLOBAL ----------------
let bot = null;
let botRunning = false;
let currentName = randomName();
let currentUUID = uuidv4();
let opCheckInterval = null;

let mode = 'normal';
let pvpMode = false;
let currentTarget = null;
let spawnPos = null;

let hasOp = false;
let opRequested = false;
let kitGiven = false;

// ---------------- ULTRA PRO MAX SETTINGS ----------------
let guardMode = false;
let guardedPlayer = null;
let guardInterval = null;
let combatInterval = null;

// ULTRA PRO MAX COMBAT SETTINGS
const ULTRA_JUMP_DELAY = 200; // Fast jumps (200ms) for maximum crits
const ULTRA_ATTACK_SPEED = 100; // Max attack speed
const TELEPORT_DISTANCE = 20; // 20 BLOCK SPHERE - up/down/left/right ANY DIRECTION
const ATTACK_RANGE = 4.5; // Max attack range
const MAX_COMBAT_TIME = 45000; // 45 seconds max combat

// ---------------- UTILS ----------------
function randomName() {
  return "PvP_" + Math.floor(Math.random() * 900000 + 100000);
}
const delay = ms => new Promise(r => setTimeout(r, ms));

// Calculate 3D distance (for sphere)
function getDistance3D(pos1, pos2) {
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  const dz = pos1.z - pos2.z;
  return Math.sqrt(dx*dx + dy*dy + dz*dz);
}

// ---------------- ULTRA PRO MAX EQUIP SYSTEM ----------------
async function ultraEquip() {
  console.log('[ULTRA] Equipping...');
  
  const items = bot.inventory.items();
  
  // Sword to hand
  const sword = items.find(i => i.name.includes('sword'));
  if (sword) {
    try {
      await bot.equip(sword, 'hand');
      console.log(`[ULTRA] ${sword.name} equipped!`);
    } catch (e) {
      console.log(`[ULTRA] Sword error: ${e.message}`);
    }
  }
  
  // Use OP commands for instant gear
  if (hasOp) {
    const opCommands = [
      '/replaceitem entity @s slot.hotbar.0 diamond_sword 1',
      '/replaceitem entity @s armor.head diamond_helmet 1',
      '/replaceitem entity @s armor.chest diamond_chestplate 1',
      '/replaceitem entity @s armor.legs diamond_leggings 1',
      '/replaceitem entity @s armor.feet diamond_boots 1',
      '/replaceitem entity @s weapon.offhand shield 1'
    ];
    
    for (const cmd of opCommands) {
      bot.chat(cmd);
      await delay(200);
    }
    console.log('[ULTRA] OP gear equipped!');
  }
  
  return true;
}

// ---------------- ULTRA PRO MAX COMBAT SYSTEM ----------------
function startUltraCombat(target) {
  console.log(`[ULTRA COMBAT] Engaging ${target.username || 'target'}!`);
  
  pvpMode = true;
  currentTarget = target;
  
  // Equip before fighting
  setTimeout(() => ultraEquip(), 100);
  
  // Start attacking
  setTimeout(() => {
    try {
      bot.pvp.attack(target);
      console.log('[ULTRA COMBAT] Attack started!');
    } catch (e) {
      console.log(`[ULTRA COMBAT] Attack error: ${e.message}`);
    }
  }, 200);
  
  // ULTRA PRO MAX COMBAT LOOP
  if (combatInterval) clearInterval(combatInterval);
  combatInterval = setInterval(() => {
    if (!pvpMode || !currentTarget) {
      clearInterval(combatInterval);
      return;
    }
    
    // ULTRA FAST JUMPING for critical hits
    bot.setControlState('jump', true);
    setTimeout(() => bot.setControlState('jump', false), 50);
    
    // ULTRA SPRINT (always sprint in combat)
    bot.setControlState('sprint', true);
    
    // Check target distance
    if (currentTarget.position) {
      const distance = getDistance3D(bot.entity.position, currentTarget.position);
      
      // If target is in attack range, keep attacking
      if (distance <= ATTACK_RANGE) {
        // Rapid attack (simulate clicking)
        if (bot.heldItem && bot.heldItem.name.includes('sword')) {
          // This makes attack speed ultra fast
          bot.swingArm('right');
        }
      }
    }
    
  }, ULTRA_JUMP_DELAY); // ULTRA FAST JUMP TIMING
  
  // Auto stop combat after 45 seconds
  setTimeout(() => {
    if (pvpMode) {
      console.log('[ULTRA COMBAT] Combat timeout (45s)');
      stopUltraCombat();
    }
  }, MAX_COMBAT_TIME);
}

function stopUltraCombat() {
  console.log('[ULTRA COMBAT] Stopping combat');
  
  pvpMode = false;
  currentTarget = null;
  
  if (combatInterval) {
    clearInterval(combatInterval);
    combatInterval = null;
  }
  
  bot.pvp.stop();
  bot.setControlState('sprint', false);
  bot.setControlState('jump', false);
}

// ---------------- 20 BLOCK SPHERE TELEPORT SYSTEM ----------------
function startUltraGuard(playerName) {
  console.log(`[ULTRA GUARD] Guarding ${playerName} with 20-block sphere TP`);
  
  const player = bot.players[playerName];
  if (!player || !player.entity) {
    console.log(`[ULTRA GUARD] Player not found`);
    return false;
  }
  
  guardedPlayer = playerName;
  guardMode = true;
  
  // Stop any combat
  stopUltraCombat();
  
  // Start 20-block sphere guard system
  if (guardInterval) clearInterval(guardInterval);
  guardInterval = setInterval(() => {
    if (!guardMode || !guardedPlayer) return;
    
    const player = bot.players[guardedPlayer];
    if (!player || !player.entity) {
      console.log(`[ULTRA GUARD] Lost player`);
      return;
    }
    
    const playerPos = player.entity.position;
    const botPos = bot.entity.position;
    
    // Calculate 3D distance (SPHERE - includes up/down)
    const distance = getDistance3D(playerPos, botPos);
    
    console.log(`[ULTRA GUARD] Distance: ${Math.round(distance)} blocks (3D sphere)`);
    
    // 🔥 20 BLOCK SPHERE TELEPORT 🔥
    // Up/Down/Left/Right/Forward/Back ANY DIRECTION > 20 blocks = INSTANT TP
    if (distance > TELEPORT_DISTANCE && hasOp) {
      console.log(`[ULTRA GUARD] ${Math.round(distance)} > 20 blocks! TELEPORTING!`);
      bot.chat(`/tp @s ${guardedPlayer}`);
      return;
    }
    
    // If close enough (3 blocks), chill
    if (distance <= 3) {
      if (bot.pathfinder.isMoving()) {
        bot.pathfinder.setGoal(null);
      }
      return;
    }
    
    // Follow player (smooth)
    const mcData = require('minecraft-data')(bot.version);
    const movements = new Movements(bot, mcData);
    movements.allowSprinting = true;
    bot.pathfinder.setMovements(movements);
    
    bot.pathfinder.setGoal(new goals.GoalNear(
      playerPos.x,
      playerPos.y,
      playerPos.z,
      3
    ));
    
    // Sprint while following
    bot.setControlState('sprint', true);
    
  }, 500); // Check every 500ms (FAST)
  
  console.log(`[ULTRA GUARD] Now guarding with 20-block sphere TP system`);
  return true;
}

function stopUltraGuard() {
  console.log('[ULTRA GUARD] Stopping guard');
  
  guardMode = false;
  guardedPlayer = null;
  
  if (guardInterval) {
    clearInterval(guardInterval);
    guardInterval = null;
  }
  
  bot.pathfinder.setGoal(null);
  bot.setControlState('sprint', false);
  bot.setControlState('jump', false);
  
  console.log('[ULTRA GUARD] Stopped');
}

// ---------------- HOSTILE DETECTION ----------------
function isHostileMob(mobType) {
  if (!mobType) return false;
  const typeLower = mobType.toLowerCase();
  const hostiles = ['zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch', 
                   'blaze', 'ghast', 'slime', 'magma_cube', 'guardian', 'shulker'];
  return hostiles.some(h => typeLower.includes(h));
}

// ---------------- CREATE BOT ----------------
function createBot() {
  if (botRunning) return;
  botRunning = true;

  console.log('[BOT] Creating:', currentName);

  bot = mineflayer.createBot({
    host: config.server.ip,
    port: config.server.port,
    username: currentName,
    uuid: currentUUID,
    auth: 'offline',
    version: config.server.version
  });

  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvp);

  // ---------------- SPAWN ----------------
  bot.once('spawn', async () => {
    console.log('[BOT] Spawned');
    spawnPos = bot.entity.position.clone();

    const mcData = mcDataLoader(config.server.version);
    const movements = new Movements(bot, mcData);
    bot.pathfinder.setMovements(movements);

    if (config.utils['auto-auth'].enabled) {
      await delay(600);
      bot.chat(`/login ${config.utils['auto-auth'].password}`);
    }

    // Auto-equip check
    setInterval(async () => {
      if (!guardMode && !pvpMode) {
        const items = bot.inventory.items();
        if (items.some(i => i.name.includes('sword'))) {
          await ultraEquip();
        }
      }
    }, 15000);

    // OP check
    if (opCheckInterval) clearInterval(opCheckInterval);
    opCheckInterval = setInterval(() => {
      if (mode === 'hard' && !hasOp && !opRequested) {
        bot.chat('/op @s');
        opRequested = true;
      }
    }, 10000);
  });

  // ---------------- OP DETECTION ----------------
  bot.on('message', (jsonMsg) => {
    const msg = jsonMsg.toString();
    console.log(`[SERVER] ${msg}`);
    
    const msgLower = msg.toLowerCase();
    const botName = bot.username.toLowerCase();
    
    if (msgLower.includes(botName) && msgLower.includes('op')) {
      console.log('[OP] DETECTED!');
      hasOp = true;
      opRequested = false;
      
      if (mode === 'hard' && !kitGiven) {
        kitGiven = true;
        giveHardModeKit();
      }
    }
  });

  // ---------------- ATTACK DETECTION (ULTRA RULES) ----------------
  bot.on('entityHurt', (entity) => {
    // Rule 1: Bot is attacked → Fight back ULTRA FAST
    if (entity.id === bot.entity.id) {
      console.log('[ULTRA] I WAS HIT!');
      
      const attacker = bot.nearestEntity(e =>
        e.type === 'player' &&
        e.username !== bot.username &&
        getDistance3D(bot.entity.position, e.position) < 6
      );

      if (attacker && !pvpMode && !guardMode) {
        console.log(`[ULTRA] ${attacker.username} hit me! FIGHTING BACK ULTRA FAST!`);
        startUltraCombat(attacker);
      }
    }
    
    // Rule 2: Guarded player is attacked → Protect them
    if (guardMode && guardedPlayer && entity.type === 'player' && entity.username === guardedPlayer) {
      console.log(`[ULTRA GUARD] ${guardedPlayer} was hit!`);
      
      const attacker = bot.nearestEntity(e =>
        e.type === 'player' &&
        e.username !== guardedPlayer &&
        e.username !== bot.username &&
        getDistance3D(entity.position, e.position) < 8
      );

      if (attacker && !pvpMode) {
        console.log(`[ULTRA GUARD] ${attacker.username} attacked my player! ATTACKING!`);
        startUltraCombat(attacker);
      }
    }
  });

  // ---------------- CHAT COMMANDS ----------------
  bot.on('chat', async (user, msg) => {
    if (user === bot.username) return;
    const cmd = msg.toLowerCase().trim();
    
    console.log(`[CHAT] ${user}: ${msg}`);

    // 🔥 ULTRA GUARD COMMAND
    if (cmd === 'guard me') {
      if (startUltraGuard(user)) {
        bot.chat(`🛡️ ULTRA GUARD ACTIVATED! I will protect you with 20-block sphere TP!`);
      }
    }

    if (cmd === 'stop guard') {
      if (guardMode && guardedPlayer === user) {
        stopUltraGuard();
        bot.chat('🛑 Guard stopped.');
      }
    }

    // 🔥 ULTRA PVP COMMAND
    if (cmd === 'fight' || cmd === 'fight me') {
      if (guardMode) {
        bot.chat(`I'm guarding ${guardedPlayer}. Say 'stop guard' first.`);
        return;
      }
      
      const player = bot.players[user];
      if (!player) {
        bot.chat("Can't see you!");
        return;
      }
      
      bot.chat(`⚔️ ULTRA PVP ENGAGED! Prepare for maximum combat!`);
      startUltraCombat(player.entity);
    }

    if (cmd === 'stop fight') {
      stopUltraCombat();
      bot.chat('⚔️ Combat stopped.');
    }

    // 🔥 KIT & EQUIP
    if (cmd === 'givekit') {
      hasOp = true;
      kitGiven = true;
      giveHardModeKit();
    }

    if (cmd === 'equip') {
      await ultraEquip();
      bot.chat('⚡ Ultra equipped!');
    }

    // 🔥 MODES
    if (['easy', 'normal', 'hard'].includes(cmd)) {
      mode = cmd;
      hasOp = false;
      opRequested = false;
      kitGiven = false;
      bot.chat(`🎮 Mode: ${mode.toUpperCase()}`);
    }

    // 🔥 INFO
    if (cmd === 'status') {
      if (guardMode) {
        const player = bot.players[guardedPlayer];
        let distance = 'N/A';
        if (player && player.entity) {
          distance = Math.round(getDistance3D(bot.entity.position, player.entity.position));
        }
        bot.chat(`🛡️ Guarding ${guardedPlayer} | Distance: ${distance} blocks | HP: ${bot.health}`);
      } else if (pvpMode) {
        bot.chat(`⚔️ ULTRA COMBAT | HP: ${bot.health} | Target: ${currentTarget?.username || 'Unknown'}`);
      } else {
        bot.chat(`✅ Ready | Mode: ${mode} | HP: ${bot.health} | OP: ${hasOp ? 'YES' : 'NO'}`);
      }
    }

    if (cmd === 'test tp') {
      if (hasOp) {
        bot.chat(`/tp @s ${user}`);
        bot.chat('✅ Teleported!');
      } else {
        bot.chat('❌ Need OP!');
      }
    }

    if (cmd === 'ultra help') {
      bot.chat('🔥 ULTRA PRO MAX COMMANDS:');
      bot.chat('guard me - 20-block sphere guard with instant TP');
      bot.chat('fight me - Ultra fast PvP combat');
      bot.chat('givekit - Get full diamond gear');
      bot.chat('equip - Force equip items');
      bot.chat('status - Check bot status');
      bot.chat('test tp - Test teleport');
      bot.chat('easy/normal/hard - Change mode');
    }
  });

  // ---------------- PHYSICS TICK ----------------
  bot.on('physicsTick', () => {
    // Keep sprinting in guard mode
    if (guardMode) {
      bot.setControlState('sprint', true);
    }
    
    // Stop sprinting when idle
    if (!pvpMode && !guardMode && !bot.pathfinder.isMoving()) {
      bot.setControlState('sprint', false);
    }
  });

  // ---------------- TARGET GONE ----------------
  bot.on('entityGone', (entity) => {
    if (currentTarget && entity.id === currentTarget.id) {
      console.log('[ULTRA] Target disappeared');
      stopUltraCombat();
    }
  });

  // ---------------- DISCONNECT ----------------
  bot.on('kicked', (reason) => {
    console.log('[BOT] Kicked:', reason);
    reset();
  });
  bot.on('end', () => {
    console.log('[BOT] Disconnected');
    reset();
  });
  bot.on('error', (err) => {
    console.log('[BOT] Error:', err.message);
  });
}

// ---------------- HARD MODE KIT ----------------
async function giveHardModeKit() {
  if (!bot) return;
  console.log('[ULTRA KIT] Giving ultra kit...');

  const commands = [
    '/give @s diamond_sword 1',
    '/give @s diamond_helmet 1',
    '/give @s diamond_chestplate 1',
    '/give @s diamond_leggings 1',
    '/give @s diamond_boots 1',
    '/give @s shield 1',
    '/give @s bow 1',
    '/give @s arrow 64',
    '/give @s golden_apple 32',
    '/give @s ender_pearl 32'
  ];

  for (const cmd of commands) {
    bot.chat(cmd);
    await delay(300);
  }

  console.log('[ULTRA KIT] Done, auto-equipping...');
  await delay(2000);
  await ultraEquip();
  bot.chat('🔥 ULTRA KIT READY! Maximum power achieved!');
}

// ---------------- RESET ----------------
function reset() {
  if (opCheckInterval) clearInterval(opCheckInterval);
  if (guardInterval) clearInterval(guardInterval);
  if (combatInterval) clearInterval(combatInterval);
  
  botRunning = false;
  pvpMode = false;
  guardMode = false;
  guardedPlayer = null;
  currentTarget = null;
  hasOp = false;
  opRequested = false;
  kitGiven = false;

  console.log('[BOT] Reconnecting in 3s...');
  setTimeout(createBot, 3000);
}

// ---------------- START ----------------
createBot();
