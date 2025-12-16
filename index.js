//----------------------------------------------------
// PVP BOT + INTELLIGENT BODYGUARD SYSTEM
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
let autoEquipInProgress = false;

// ---------------- INTELLIGENT BODYGUARD SYSTEM ----------------
let guardMode = false;
let guardedPlayer = null;
let guardFollowInterval = null;
let guardCheckInterval = null;
let lastThreatCheck = 0;
let isInCombat = false;
let combatStartTime = 0;

// List of hostile mobs to attack
const HOSTILE_MOBS = [
  'zombie', 'skeleton', 'spider', 'creeper', 'enderman', 'witch',
  'slime', 'magma_cube', 'blaze', 'ghast', 'wither_skeleton',
  'guardian', 'elder_guardian', 'shulker', 'evoker', 'vex',
  'vindicator', 'pillager', 'ravager', 'phantom', 'drowned',
  'husk', 'stray', 'hoglin', 'zoglin', 'piglin_brute'
];

// List of passive mobs to IGNORE
const PASSIVE_MOBS = [
  'cow', 'pig', 'sheep', 'chicken', 'rabbit', 'horse', 'donkey',
  'mule', 'llama', 'cat', 'wolf', 'ocelot', 'fox', 'panda',
  'bee', 'dolphin', 'turtle', 'parrot', 'bat', 'squid',
  'glow_squid', 'cod', 'salmon', 'tropical_fish', 'pufferfish',
  'villager', 'wandering_trader', 'iron_golem', 'snow_golem',
  'strider', 'axolotl', 'goat'
];

// ---------------- UTILS ----------------
function randomName() {
  return "PvP_" + Math.floor(Math.random() * 900000 + 100000);
}
const delay = ms => new Promise(r => setTimeout(r, ms));

function isHostileMob(mobType) {
  if (!mobType) return false;
  const typeLower = mobType.toLowerCase();
  return HOSTILE_MOBS.some(hostile => typeLower.includes(hostile));
}

function isPassiveMob(mobType) {
  if (!mobType) return false;
  const typeLower = mobType.toLowerCase();
  return PASSIVE_MOBS.some(passive => typeLower.includes(passive));
}

// ---------------- AUTOMATIC EQUIPMENT SYSTEM ----------------
function isItemInHotbar(item) {
  return item && item.slot >= 36 && item.slot <= 44;
}

async function autoHoldAndEquip(itemName) {
  const items = bot.inventory.items();
  const item = items.find(i => i.name === itemName);

  if (!item) return false;

  // If already in hotbar, switch to it
  if (isItemInHotbar(item)) {
    const hotbarIndex = item.slot - 36;
    bot.setQuickBarSlot(hotbarIndex);
    console.log(`[EQUIP] Holding ${itemName} in hotbar slot ${hotbarIndex}`);
    await delay(200);
    return true;
  }

  // Try OP method to move to hotbar
  if (hasOp) {
    for (let i = 36; i < 45; i++) {
      if (!bot.inventory.slots[i]) {
        const hotbarIndex = i - 36;
        bot.chat(`/replaceitem entity @s slot.hotbar.${hotbarIndex} ${itemName} 1`);
        console.log(`[EQUIP] OP moved ${itemName} to hotbar`);
        await delay(500);

        // Switch to it
        bot.setQuickBarSlot(hotbarIndex);
        await delay(200);
        return true;
      }
    }
  }

  return false;
}

async function automaticEquipmentSequence() {
  if (autoEquipInProgress) return;
  autoEquipInProgress = true;

  const equipmentList = [
    'diamond_boots',
    'diamond_leggings',
    'diamond_chestplate',
    'diamond_helmet',
    'diamond_sword',
    'shield'
  ];

  for (const item of equipmentList) {
    await autoHoldAndEquip(item);
    await delay(500);
  }

  autoEquipInProgress = false;
  return true;
}

// ---------------- SMART MOVEMENT SYSTEM ----------------
class SmartBodyguard {
  constructor() {
    this.lastJumpTime = 0;
    this.lastSprintCheck = 0;
    this.isSprinting = false;
    this.followDistance = 3;
    this.maxFollowDistance = 15;
    this.teleportCooldown = 0;
  }

  shouldJump() {
    const now = Date.now();
    if (now - this.lastJumpTime < 1000) return false;

    if (isInCombat) {
      // Jump for critical hits
      return Math.random() < 0.3;
    }

    return Math.random() < 0.01;
  }

  shouldSprint() {
    const now = Date.now();
    if (now - this.lastSprintCheck < 2000) return this.isSprinting;

    this.lastSprintCheck = now;

    if (isInCombat) {
      this.isSprinting = true;
      return true;
    }

    if (guardMode && guardedPlayer) {
      const player = bot.players[guardedPlayer];
      if (player && player.entity) {
        // Check if player is moving
        this.isSprinting = true; // Always sprint when following
        return true;
      }
    }

    this.isSprinting = false;
    return false;
  }

  updateMovement() {
    if (this.shouldSprint()) {
      bot.setControlState('sprint', true);
    } else {
      bot.setControlState('sprint', false);
    }

    if (this.shouldJump()) {
      bot.setControlState('jump', true);
      this.lastJumpTime = Date.now();
      setTimeout(() => bot.setControlState('jump', false), 100);
    }
  }
}

const smartGuard = new SmartBodyguard();

// ---------------- INTELLIGENT FOLLOW SYSTEM ----------------
function startSmartFollowing() {
  if (guardFollowInterval) clearInterval(guardFollowInterval);

  guardFollowInterval = setInterval(async () => {
    if (!guardMode || !guardedPlayer) return;

    const player = bot.players[guardedPlayer];
    if (!player || !player.entity) {
      console.log(`[GUARD] Lost sight of ${guardedPlayer}`);
      return;
    }

    const playerPos = player.entity.position;
    const botPos = bot.entity.position;
    const distance = botPos.distanceTo(playerPos);

    smartGuard.updateMovement();

    // Teleport if too far and has OP
    if (distance > smartGuard.maxFollowDistance) {
      if (hasOp && !isInCombat && smartGuard.teleportCooldown === 0) {
        console.log(`[GUARD] Teleporting to ${guardedPlayer}`);
        bot.chat(`/tp @s ${guardedPlayer}`);
        smartGuard.teleportCooldown = 5;

        setTimeout(() => {
          smartGuard.teleportCooldown = 0;
        }, 5000);
        return;
      }
    }

    // Stop if close enough
    if (distance <= smartGuard.followDistance) {
      if (bot.pathfinder.isMoving() && !isInCombat) {
        bot.pathfinder.setGoal(null);
      }
      return;
    }

    // Follow player
    const mcData = require('minecraft-data')(bot.version);
    const movements = new Movements(bot, mcData);
    movements.allowSprinting = true;
    bot.pathfinder.setMovements(movements);

    bot.pathfinder.setGoal(new goals.GoalNear(
      playerPos.x,
      playerPos.y,
      playerPos.z,
      smartGuard.followDistance
    ), true);

  }, 1000);
}

// ---------------- INTELLIGENT THREAT ASSESSMENT ----------------
function assessThreats() {
  if (!guardMode || !guardedPlayer || isInCombat) return null;

  const player = bot.players[guardedPlayer];
  if (!player || !player.entity) return null;

  const playerPos = player.entity.position;
  const now = Date.now();

  if (now - lastThreatCheck < 2000) return null;
  lastThreatCheck = now;

  // Find threats near player
  const nearbyEntities = Object.values(bot.entities).filter(e =>
    e.position.distanceTo(playerPos) < 10 &&
    e.type !== 'object' &&
    e.type !== 'orb' &&
    e.type !== 'arrow' &&
    e.type !== 'item'
  );

  let highestThreat = null;
  let highestPriority = 0;

  for (const entity of nearbyEntities) {
    let threatPriority = 0;

    // Player attacking guarded player
    if (entity.type === 'player' && entity.username !== guardedPlayer && entity.username !== bot.username) {
      threatPriority = 3;
    }
    // Hostile mob (use entity.name which contains mob type)
    else if (entity.type === 'mob' && entity.name && isHostileMob(entity.name)) {
      threatPriority = 2;
    }
    // Passive mob (ignore)
    else if (entity.type === 'mob' && entity.name && isPassiveMob(entity.name)) {
      threatPriority = 0;
      continue; // Skip passive mobs
    }

    if (threatPriority > highestPriority) {
      highestPriority = threatPriority;
      highestThreat = entity;
    }
  }

  return highestPriority >= 2 ? highestThreat : null;
}

// ---------------- INTELLIGENT COMBAT SYSTEM ----------------
function engageThreat(threat) {
  if (!threat || !guardMode || isInCombat) return;

  console.log(`[GUARD] Engaging threat: ${threat.username || threat.name || 'unknown'}`);
  isInCombat = true;
  combatStartTime = Date.now();

  if (guardFollowInterval) {
    clearInterval(guardFollowInterval);
    guardFollowInterval = null;
  }

  const combatInterval = setInterval(() => {
    if (!isInCombat) {
      clearInterval(combatInterval);
      return;
    }

    smartGuard.updateMovement();

    if (!threat.isValid || threat.health <= 0 || threat.position.distanceTo(bot.entity.position) > 15) {
      console.log(`[GUARD] Threat eliminated`);
      disengageCombat();
      clearInterval(combatInterval);
      return;
    }

    bot.pvp.attack(threat);

  }, 100);

  bot.pvp.attack(threat);

  setTimeout(() => {
    if (isInCombat) {
      console.log(`[GUARD] Combat timeout`);
      disengageCombat();
      clearInterval(combatInterval);
    }
  }, 30000);
}

function disengageCombat() {
  isInCombat = false;
  combatStartTime = 0;
  bot.pvp.stop();

  if (guardMode && guardedPlayer) {
    console.log(`[GUARD] Resuming guard duty`);
    startSmartFollowing();
  }
}

// ---------------- BODYGUARD CONTROL ----------------
function startGuarding(playerName) {
  console.log(`[GUARD] Starting guard for ${playerName}`);

  const player = bot.players[playerName];
  if (!player) {
    console.log(`[GUARD] Player ${playerName} not found`);
    return false;
  }

  guardedPlayer = playerName;
  guardMode = true;
  isInCombat = false;

  // Stop any PvP
  if (pvpMode) {
    bot.pvp.stop();
    pvpMode = false;
    currentTarget = null;
  }

  startSmartFollowing();

  if (guardCheckInterval) clearInterval(guardCheckInterval);
  guardCheckInterval = setInterval(() => {
    if (!guardMode || isInCombat) return;

    const threat = assessThreats();
    if (threat) {
      engageThreat(threat);
    }
  }, 2000);

  console.log(`[GUARD] Now guarding ${playerName}`);
  return true;
}

function stopGuarding() {
  console.log('[GUARD] Stopping guard duty');

  guardMode = false;
  guardedPlayer = null;
  isInCombat = false;

  if (guardFollowInterval) {
    clearInterval(guardFollowInterval);
    guardFollowInterval = null;
  }

  if (guardCheckInterval) {
    clearInterval(guardCheckInterval);
    guardCheckInterval = null;
  }

  bot.pathfinder.setGoal(null);
  bot.pvp.stop();
  bot.setControlState('sprint', false);
  bot.setControlState('jump', false);

  console.log('[GUARD] Guard duty stopped');
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

    // Auto-equip check after spawn
    setTimeout(async () => {
      const items = bot.inventory.items();
      if (items.some(i => i.name.includes('sword'))) {
        await autoHoldAndEquip('diamond_sword');
      }
    }, 3000);

    if (opCheckInterval) clearInterval(opCheckInterval);
    opCheckInterval = setInterval(() => {
      if (mode === 'hard' && !hasOp && !opRequested) {
        bot.chat('/op @s');
        opRequested = true;
      }
    }, 10000);
  });

  // ---------------- FIXED OP DETECTION ----------------
  bot.on('message', (jsonMsg) => {
    const msg = jsonMsg.toString();
    const msgLower = msg.toLowerCase();
    const botName = bot.username.toLowerCase();

    console.log(`[CHAT] ${msg}`);

    // Better OP detection
    if (msgLower.includes('operator') && msgLower.includes(botName)) {
      console.log('[OP] Detected OP from server message');
      hasOp = true;
      opRequested = false;
    }

    // Direct OP messages
    if (msgLower.includes('you are now op') ||
        msgLower.includes('opped') ||
        msgLower.includes('made operator') ||
        msgLower.includes('granted operator')) {
      console.log('[OP] Direct OP detection');
      hasOp = true;
      opRequested = false;

      if (mode === 'hard' && !kitGiven) {
        kitGiven = true;
        giveHardModeKit();
      }
    }
  });

  // ---------------- ATTACK DETECTION ----------------
  bot.on('entityHurt', (entity) => {
    // Guarded player was attacked
    if (guardMode && guardedPlayer && entity.type === 'player' && entity.username === guardedPlayer) {
      console.log(`[GUARD] ${guardedPlayer} was attacked!`);

      const attacker = bot.nearestEntity(e =>
        e.type === 'player' &&
        e.username !== guardedPlayer &&
        e.username !== bot.username &&
        e.position.distanceTo(entity.position) < 8
      );

      if (attacker && !isInCombat) {
        console.log(`[GUARD] ${attacker.username} attacked ${guardedPlayer}! Engaging!`);
        engageThreat(attacker);
      }
    }

    // PvP MODE: Bot was attacked (self-defense)
    if (!guardMode && entity.id === bot.entity.id) {
      const attacker = bot.nearestEntity(e =>
        e.type === 'player' &&
        e.username !== bot.username &&
        e.position.distanceTo(bot.entity.position) < 6
      );

      if (attacker && !pvpMode) {
        console.log('[PVP] Attacked by', attacker.username);
        currentTarget = attacker;
        pvpMode = true;
        startPvP();
      }
    }
  });

  // ---------------- CHAT COMMANDS ----------------
  bot.on('chat', async (user, msg) => {
    if (user === bot.username) return;
    const cmd = msg.toLowerCase().trim();

    console.log(`[CHAT CMD] ${user}: ${cmd}`);

    // Bodyguard commands
    if (cmd === 'guard me' || cmd === 'guard') {
      if (startGuarding(user)) {
        bot.chat(`I will guard you, ${user}!`);
      } else {
        bot.chat(`I can't see you, ${user}!`);
      }
    }

    if (cmd === 'stop' || cmd === 'stop guard') {
      if (guardMode && guardedPlayer === user) {
        stopGuarding();
        bot.chat('Stopped guard duty.');
      } else if (guardMode) {
        bot.chat(`I'm guarding ${guardedPlayer}. Ask them to stop.`);
      } else {
        bot.chat('Not guarding anyone.');
      }
    }

    if (cmd === 'follow') {
      if (!guardMode) {
        startGuarding(user);
        bot.chat(`Following you ${user}!`);
      }
    }

    if (cmd === 'protect') {
      if (!guardMode) {
        startGuarding(user);
        bot.chat(`Protecting you ${user}!`);
      }
    }

    // PvP Commands
    if (cmd === 'fight') {
      if (guardMode) {
        bot.chat(`I'm guarding ${guardedPlayer}. Use 'stop' first.`);
        return;
      }

      const player = bot.players[user];
      if (!player) {
        bot.chat("I can't see you!");
        return;
      }

      bot.chat(`Okay, let's fight ${user}!`);
      pvpMode = true;
      currentTarget = player.entity;
      startPvP();
    }

    if (cmd === 'stop fight') {
      if (pvpMode) {
        pvpMode = false;
        currentTarget = null;
        bot.pvp.stop();
        bot.chat('Stopped fighting.');
      }
    }

    // Mode switching
    if (['easy', 'normal', 'hard'].includes(cmd)) {
      mode = cmd;
      hasOp = false;
      opRequested = false;
      kitGiven = false;
      bot.chat(`Mode: ${mode.toUpperCase()}`);
      console.log('[MODE]', mode);
    }

    if (cmd === 'givekit') {
      hasOp = true; // Assume we have OP for kit
      kitGiven = true;
      giveHardModeKit();
    }

    if (cmd === 'autoequip') {
      await automaticEquipmentSequence();
      bot.chat('Auto-equip complete!');
    }

    if (cmd === 'opequip') {
      if (hasOp) {
        bot.chat('/replaceitem entity @s armor.head diamond_helmet');
        bot.chat('/replaceitem entity @s armor.chest diamond_chestplate');
        bot.chat('/replaceitem entity @s armor.legs diamond_leggings');
        bot.chat('/replaceitem entity @s armor.feet diamond_boots');
        bot.chat('/replaceitem entity @s weapon.mainhand diamond_sword');
        bot.chat('/replaceitem entity @s weapon.offhand shield');
        bot.chat('OP equip complete!');
      } else {
        bot.chat('Need OP! Type "givekit" first.');
      }
    }

    if (cmd === 'status') {
      if (guardMode) {
        bot.chat(`Guarding ${guardedPlayer} | Combat: ${isInCombat ? 'Yes' : 'No'} | HP: ${bot.health}`);
      } else if (pvpMode) {
        bot.chat(`Fighting ${currentTarget?.username || 'someone'} | HP: ${bot.health}`);
      } else {
        bot.chat(`Available | Mode: ${mode} | HP: ${bot.health} | OP: ${hasOp ? 'Yes' : 'No'}`);
      }
    }

    if (cmd === 'help') {
      bot.chat('Commands: guard me, stop, fight, stop fight, givekit, autoequip, opequip, status, easy/normal/hard');
    }

    if (cmd === 'testop') {
      if (hasOp) {
        bot.chat('/say I have OP permissions!');
        bot.chat('/give @s diamond 1');
      } else {
        bot.chat('No OP permissions yet.');
      }
    }
  });

  // ---------------- PVP SYSTEM ----------------
  async function startPvP() {
    if (!currentTarget) return;

    console.log('[PVP] Starting fight!');

    // Auto-equip sword before fighting
    const items = bot.inventory.items();
    const sword = items.find(i => i.name.includes('sword'));
    if (sword && isItemInHotbar(sword)) {
      bot.setQuickBarSlot(sword.slot - 36);
    }

    try {
      bot.pvp.attack(currentTarget);
    } catch (e) {
      console.log('[PVP] Error:', e.message);
    }
  }

  // ---------------- PHYSICS TICK ----------------
  bot.on('physicsTick', () => {
    // Update guard movement
    if (guardMode) {
      smartGuard.updateMovement();
    }

    // PvP combat movement
    if (pvpMode && currentTarget) {
      bot.setControlState('sprint', true);

      // Jump occasionally for critical hits
      if (Date.now() % 3000 < 100) {
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 100);
      }
    }
  });

  // ---------------- TARGET GONE ----------------
  bot.on('entityGone', (entity) => {
    if (currentTarget && entity.id === currentTarget.id) {
      pvpMode = false;
      currentTarget = null;
      bot.pvp.stop();
      console.log('[PVP] Target gone');
    }

    if (isInCombat) {
      disengageCombat();
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
  console.log('[KIT] Giving kit...');

  // Clear old items first if OP
  if (hasOp) {
    bot.chat('/clear');
    await delay(1000);
  }

  const commands = [
    '/give @s diamond_sword 1',
    '/give @s diamond_helmet 1',
    '/give @s diamond_chestplate 1',
    '/give @s diamond_leggings 1',
    '/give @s diamond_boots 1',
    '/give @s shield 1',
    '/give @s bow 1',
    '/give @s arrow 64',
    '/give @s golden_apple 16',
    '/give @s ender_pearl 16'
  ];

  for (const cmd of commands) {
    bot.chat(cmd);
    await delay(500);
  }

  console.log('[KIT] Done, waiting for items...');
  await delay(3000);

  console.log('[KIT] Auto-equipping...');
  await automaticEquipmentSequence();
  bot.chat('Kit received and equipped! Ready for action!');
}

// ---------------- RESET ----------------
function reset() {
  if (opCheckInterval) clearInterval(opCheckInterval);
  if (guardFollowInterval) clearInterval(guardFollowInterval);
  if (guardCheckInterval) clearInterval(guardCheckInterval);

  botRunning = false;
  pvpMode = false;
  guardMode = false;
  guardedPlayer = null;
  isInCombat = false;
  hasOp = false;
  opRequested = false;
  kitGiven = false;
  autoEquipInProgress = false;

  console.log('[BOT] Reconnecting in 5s...');
  setTimeout(createBot, 5000);
}

// ---------------- START ----------------
createBot();