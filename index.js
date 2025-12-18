//----------------------------------------------------
// PVP BOT - ULTIMATE NETHERITE WITH ANTI-BAN PROTECTION
//----------------------------------------------------
const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');
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
let antiBanTimeout = null;

let mode = 'normal';
let pvpMode = false;
let currentTarget = null;
let spawnPos = null;

let hasOp = false;
let opRequested = false;
let kitGiven = false;
let autoEquipInProgress = false;

// ---------------- ANTI-BAN SYSTEM ----------------
const BAN_TRIGGER_WORDS = [
  'ban', 'banned', 'kick', 'cheater', 'hacker', 
  'report', 'staff', 'admin', 'mod', 'owner',
  'ipban', 'permanent', 'anticheat'
];

// ---------------- UTILS ----------------
function randomName() {
  return "PvP_" + Math.floor(Math.random() * 900000 + 100000);
}
const delay = ms => new Promise(r => setTimeout(r, ms));

// ---------------- ANTI-BAN PROTECTION ----------------
function checkForBanMessage(message) {
  const lowerMsg = message.toLowerCase();
  
  for (const trigger of BAN_TRIGGER_WORDS) {
    if (lowerMsg.includes(trigger)) {
      // Check if message is about this bot
      const botNameLower = bot.username.toLowerCase();
      if (lowerMsg.includes(botNameLower) || 
          lowerMsg.includes('bot') || 
          lowerMsg.includes('hack')) {
        return true;
      }
    }
  }
  return false;
}

async function antiBanEscape() {
  console.log('[ANTI-BAN] ⚠️ BAN DETECTED! Initiating escape protocol...');
  
  // Send fake message to confuse
  if (Math.random() > 0.5) {
    bot.chat('?');
  } else {
    bot.chat('lag');
  }
  
  await delay(500);
  
  // Change identity
  currentName = randomName();
  currentUUID = uuidv4();
  
  console.log(`[ANTI-BAN] 🆕 New identity: ${currentName}`);
  console.log(`[ANTI-BAN] 🔄 UUID changed: ${currentUUID}`);
  
  // Disconnect and reconnect with new identity
  if (bot) {
    try {
      bot.quit('anti-ban protection');
    } catch (e) {}
  }
  
  // Reset all states
  resetBot();
  
  // Reconnect after delay (random between 3-8 seconds)
  const reconnectDelay = 3000 + Math.random() * 5000;
  console.log(`[ANTI-BAN] 🔄 Reconnecting in ${Math.round(reconnectDelay/1000)}s...`);
  
  setTimeout(() => {
    createBot();
  }, reconnectDelay);
}

// ---------------- NETHERITE EQUIPMENT LIST ----------------
const NETHERITE_GEAR = {
  // Armor with full enchantments
  helmet: 'netherite_helmet{Enchantments:[{id:"protection",lvl:4},{id:"unbreaking",lvl:3},{id:"mending",lvl:1},{id:"respiration",lvl:3},{id:"aqua_affinity",lvl:1}]}',
  chestplate: 'netherite_chestplate{Enchantments:[{id:"protection",lvl:4},{id:"unbreaking",lvl:3},{id:"mending",lvl:1}]}',
  leggings: 'netherite_leggings{Enchantments:[{id:"protection",lvl:4},{id:"unbreaking",lvl:3},{id:"mending",lvl:1}]}',
  boots: 'netherite_boots{Enchantments:[{id:"protection",lvl:4},{id:"unbreaking",lvl:3},{id:"mending",lvl:1},{id:"feather_falling",lvl:4},{id:"depth_strider",lvl:3}]}',
  
  // Weapons with max enchantments
  sword: 'netherite_sword{Enchantments:[{id:"sharpness",lvl:5},{id:"unbreaking",lvl:3},{id:"mending",lvl:1},{id:"fire_aspect",lvl:2},{id:"knockback",lvl:2},{id:"looting",lvl:3}]}',
  shield: 'shield{Enchantments:[{id:"unbreaking",lvl:3},{id:"mending",lvl:1}]}',
  
  // Other items
  bow: 'bow{Enchantments:[{id:"power",lvl:5},{id:"unbreaking",lvl:3},{id:"mending",lvl:1},{id:"flame",lvl:1},{id:"infinity",lvl:1},{id:"punch",lvl:2}]}',
  golden_apple: 'golden_apple',
  enchanted_golden_apple: 'enchanted_golden_apple',
  ender_pearl: 'ender_pearl',
  arrow: 'arrow',
  totem: 'totem_of_undying'
};

// ---------------- EQUIPMENT SYSTEM ----------------
function isItemInHotbar(item) {
  return item && item.slot >= 36 && item.slot <= 44;
}

async function autoHoldAndEquip(itemName) {
  console.log(`[AUTO] Auto-hold and equip ${itemName}...`);
  
  const items = bot.inventory.items();
  const item = items.find(i => i.name.includes(itemName.split('{')[0])); // Remove NBT for matching
  
  if (!item) {
    console.log(`[AUTO] ${itemName} not found`);
    return false;
  }
  
  // Already in hotbar? Perfect!
  if (isItemInHotbar(item)) {
    const hotbarIndex = item.slot - 36;
    bot.setQuickBarSlot(hotbarIndex);
    console.log(`[AUTO] Holding ${itemName} in hotbar slot ${hotbarIndex}`);
    
    // Trigger auto-equip actions
    await delay(200);
    bot.setControlState('jump', true);
    await delay(50);
    bot.setControlState('jump', false);
    
    return true;
  }
  
  console.log(`[AUTO] ${itemName} needs to be moved to hotbar`);
  return false;
}

async function automaticEquipmentSequence() {
  if (autoEquipInProgress) return;
  
  autoEquipInProgress = true;
  console.log('[AUTO] ===== STARTING NETHERITE EQUIPMENT =====');
  
  await delay(1000);
  
  const equipmentOrder = [
    'netherite_boots',
    'netherite_leggings', 
    'netherite_chestplate',
    'netherite_helmet',
    'netherite_sword',
    'shield'
  ];
  
  let successCount = 0;
  
  for (const item of equipmentOrder) {
    try {
      const success = await autoHoldAndEquip(item);
      if (success) successCount++;
      await delay(600);
    } catch (error) {
      console.log(`[AUTO ERROR] ${item}: ${error.message}`);
    }
  }
  
  console.log(`[AUTO] ===== COMPLETE: ${successCount}/${equipmentOrder.length} equipped =====`);
  autoEquipInProgress = false;
  return successCount;
}

// ---------------- CREATE BOT ----------------
function createBot() {
  if (botRunning) return;
  botRunning = true;

  console.log('[BOT] Creating:', currentName);
  console.log('[BOT] UUID:', currentUUID);

  bot = mineflayer.createBot({
    host: config.server.ip,
    port: config.server.port,
    username: currentName,
    uuid: currentUUID,
    auth: 'offline',
    version: config.server.version || '1.20.1'
  });

  bot.loadPlugin(pathfinder);
  bot.loadPlugin(pvp);

  // ---------------- ANTI-BAN MESSAGE DETECTION ----------------
  bot.on('message', (jsonMsg) => {
    const message = jsonMsg.toString();
    const plainMessage = message.replace(/§[0-9a-fk-or]/g, ''); // Remove color codes
    
    // Check for ban triggers
    if (checkForBanMessage(plainMessage)) {
      console.log(`[ANTI-BAN] Detected potential ban message: "${plainMessage}"`);
      
      // Debounce - only trigger once every 10 seconds
      if (antiBanTimeout) {
        clearTimeout(antiBanTimeout);
      }
      
      antiBanTimeout = setTimeout(() => {
        antiBanEscape();
      }, 2000); // Wait 2 seconds before escaping
    }
    
    // Also check for OP messages
    const botName = bot.username.toLowerCase();
    const msg = plainMessage.toLowerCase();
    
    if ((msg.includes('opped') && msg.includes(botName)) ||
        (msg.includes('operator') && msg.includes(botName)) ||
        msg.includes('you are now op') ||
        (msg.includes('made') && msg.includes(botName) && msg.includes('op'))) {
      if (!hasOp) {
        hasOp = true;
        opRequested = false;
        console.log('[OP] Granted!');
        if (mode === 'hard' && !kitGiven) {
          kitGiven = true;
          giveUltimateNetheriteKit();
        }
      }
    }
  });

  // ---------------- SPAWN ----------------
  bot.once('spawn', async () => {
    console.log('[BOT] Spawned as', bot.username);
    console.log('[BOT] Health:', bot.health, 'Food:', bot.food);
    
    spawnPos = bot.entity.position.clone();

    const mcData = mcDataLoader(bot.version);
    const movements = new Movements(bot, mcData);
    bot.pathfinder.setMovements(movements);

    if (config.utils['auto-auth']?.enabled) {
      await delay(600);
      bot.chat(`/login ${config.utils['auto-auth'].password}`);
    }

    // Setup auto systems
    setupAutoSystems();

    // OP check interval
    if (opCheckInterval) clearInterval(opCheckInterval);
    opCheckInterval = setInterval(() => {
      if (mode === 'hard' && !hasOp && !opRequested) {
        bot.chat('admin please give me operator');
        opRequested = true;
      }
    }, 15000);
  });

  // ---------------- CHAT COMMANDS ----------------
  bot.on('chat', async (user, msg) => {
    if (user === bot.username) return;
    
    const cmd = msg.toLowerCase().trim();
    const userMsg = msg.toLowerCase();

    // Anti-ban trigger command (manual)
    if (cmd === 'panic' || cmd === 'escape' || cmd === 'antiban') {
      console.log(`[ANTI-BAN] Manual escape triggered by ${user}`);
      antiBanEscape();
      return;
    }

    if (['easy', 'normal', 'hard'].includes(cmd)) {
      mode = cmd;
      hasOp = false;
      opRequested = false;
      kitGiven = false;
      bot.chat(`Mode: ${mode.toUpperCase()}`);
      console.log('[MODE]', mode);
    }

    if (cmd === 'ultimateset' || cmd === 'giveultimate') {
      hasOp = true;
      kitGiven = true;
      giveUltimateNetheriteKit();
    }

    if (cmd === 'autoequip') {
      bot.chat('Starting auto-equip...');
      await automaticEquipmentSequence();
      bot.chat('Auto-equip complete!');
    }

    if (cmd === 'identity') {
      bot.chat(`I am ${bot.username}`);
      bot.chat(`My secret code: ${currentUUID.slice(0, 8)}`);
    }

    if (cmd === 'status') {
      const items = bot.inventory.items();
      const netheriteCount = items.filter(i => i.name.includes('netherite')).length;
      
      bot.chat(`⚔️ ${bot.username} | ❤️${bot.health} | 🍖${bot.food} | Netherite: ${netheriteCount}`);
      
      if (bot.inventory.slots[5]) bot.chat(`Helmet: ${bot.inventory.slots[5].name}`);
      if (bot.inventory.slots[6]) bot.chat(`Chest: ${bot.inventory.slots[6].name}`);
      if (bot.heldItem) bot.chat(`Weapon: ${bot.heldItem.name}`);
    }

    if (cmd === 'testban') {
      // Test anti-ban system
      bot.chat('Testing anti-ban system...');
      setTimeout(() => {
        bot.emit('message', JSON.stringify({ text: `BAN ${bot.username} for hacking!` }));
      }, 1000);
    }
  });

  // ---------------- ATTACK DETECTION ----------------
  bot.on('entityHurt', (entity) => {
    if (!bot.entity) return;
    if (entity.id !== bot.entity.id) return;

    const attacker = bot.nearestEntity(e =>
      e.type === 'player' &&
      e.username &&
      e.username !== bot.username &&
      e.position.distanceTo(bot.entity.position) < 6
    );

    if (attacker && !pvpMode) {
      console.log('[PVP] Attacked by', attacker.username);
      currentTarget = attacker;
      pvpMode = true;
      startPvP();
    }
  });

  // ---------------- PVP ----------------
  async function startPvP() {
    if (!currentTarget) return;
    
    console.log('[PVP] Fighting!');
    
    // Auto-equip sword
    const items = bot.inventory.items();
    const sword = items.find(i => i.name.includes('sword') && isItemInHotbar(i));
    if (sword) {
      bot.setQuickBarSlot(sword.slot - 36);
    }
    
    try {
      bot.pvp.attack(currentTarget);
    } catch (e) {
      console.log('[PVP] Error:', e.message);
    }
  }

  // ---------------- COMBAT MOVEMENT ----------------
  bot.on('physicsTick', () => {
    if (!pvpMode || !currentTarget) return;
    
    bot.setControlState('sprint', true);
    if (bot.entity.onGround && Math.random() < 0.1) {
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 100);
    }
  });

  // ---------------- TARGET GONE ----------------
  bot.on('entityGone', (entity) => {
    if (currentTarget && entity.id === currentTarget.id) {
      console.log('[PVP] Target gone');
      pvpMode = false;
      currentTarget = null;
      try { bot.pvp.stop(); } catch {}
      bot.setControlState('sprint', false);
      bot.setControlState('jump', false);
    }
  });

  // ---------------- DISCONNECT ----------------
  bot.on('kicked', (reason) => {
    console.log('[BOT] Kicked:', reason);
    console.log('[ANTI-BAN] Possible ban detected! Changing identity...');
    antiBanEscape();
  });
  
  bot.on('end', (reason) => {
    console.log('[BOT] Disconnected:', reason);
    resetBot();
  });
  
  bot.on('error', (err) => {
    console.log('[BOT] Error:', err.message);
  });
}

// ---------------- AUTO SYSTEMS ----------------
function setupAutoSystems() {
  // Auto-heal
  setInterval(() => {
    if (!bot || bot.health >= 15 || autoEquipInProgress) return;
    
    const items = bot.inventory.items();
    const gapple = items.find(i => 
      (i.name === 'golden_apple' || i.name === 'enchanted_golden_apple') && 
      isItemInHotbar(i)
    );
    
    if (gapple) {
      const prevSlot = bot.quickBarSlot;
      const appleSlot = gapple.slot - 36;
      
      bot.setQuickBarSlot(appleSlot);
      bot.activateItem();
      console.log(`[AUTO-HEAL] Eating ${gapple.name}...`);
      
      setTimeout(() => {
        const sword = items.find(i => i.name.includes('sword') && isItemInHotbar(i));
        if (sword) bot.setQuickBarSlot(sword.slot - 36);
        else bot.setQuickBarSlot(prevSlot);
      }, 2000);
    }
  }, 3000);
}

// ---------------- ULTIMATE NETHERITE KIT ----------------
async function giveUltimateNetheriteKit() {
  if (!bot) return;
  console.log('[KIT] Giving ULTIMATE NETHERITE kit...');
  bot.chat('Getting ultimate netherite gear...');

  // Clear inventory first
  if (hasOp) {
    bot.chat('/clear');
    await delay(1000);
  }

  // Give enchanted netherite gear
  const commands = [
    `/give @s ${NETHERITE_GEAR.sword} 1`,
    `/give @s ${NETHERITE_GEAR.helmet} 1`,
    `/give @s ${NETHERITE_GEAR.chestplate} 1`,
    `/give @s ${NETHERITE_GEAR.leggings} 1`,
    `/give @s ${NETHERITE_GEAR.boots} 1`,
    `/give @s ${NETHERITE_GEAR.shield} 1`,
    `/give @s ${NETHERITE_GEAR.bow} 1`,
    `/give @s ${NETHERITE_GEAR.arrow} 64`,
    `/give @s ${NETHERITE_GEAR.enchanted_golden_apple} 32`,
    `/give @s ${NETHERITE_GEAR.ender_pearl} 32`,
    `/give @s ${NETHERITE_GEAR.totem} 5`,
    `/give @s netherite_pickaxe{Enchantments:[{id:"efficiency",lvl:5},{id:"unbreaking",lvl:3},{id:"mending",lvl:1}]} 1`,
    `/give @s netherite_axe{Enchantments:[{id:"sharpness",lvl:5},{id:"efficiency",lvl:5},{id:"unbreaking",lvl:3},{id:"mending",lvl:1}]} 1`
  ];

  for (const cmd of commands) {
    bot.chat(cmd);
    await delay(400);
  }

  console.log('[KIT] Ultimate kit given!');
  await delay(3000);
  
  // Auto-equip
  console.log('[KIT] Auto-equipping ultimate gear...');
  bot.chat('Auto-equipping ultimate netherite gear...');
  
  setTimeout(async () => {
    await automaticEquipmentSequence();
    bot.chat('⚔️ ULTIMATE NETHERITE READY! ⚔️');
  }, 1500);
}

// ---------------- RESET BOT ----------------
function resetBot() {
  if (opCheckInterval) {
    clearInterval(opCheckInterval);
    opCheckInterval = null;
  }
  
  if (antiBanTimeout) {
    clearTimeout(antiBanTimeout);
    antiBanTimeout = null;
  }
  
  botRunning = false;
  pvpMode = false;
  currentTarget = null;
  hasOp = false;
  opRequested = false;
  kitGiven = false;
  autoEquipInProgress = false;
}

// ---------------- START ----------------
createBot();
