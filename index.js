//----------------------------------------------------
// PVP BOT - FULLY AUTOMATIC EQUIPMENT SYSTEM
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

let mode = 'normal';
let pvpMode = false;
let currentTarget = null;
let spawnPos = null;

let hasOp = false;
let opRequested = false;
let kitGiven = false;
let autoEquipInProgress = false;

// ---------------- UTILS ----------------
function randomName() {
  return "PvP_" + Math.floor(Math.random() * 900000 + 100000);
}
const delay = ms => new Promise(r => setTimeout(r, ms));

// ---------------- AUTOMATIC HOTBAR MANAGEMENT ----------------
function isItemInHotbar(item) {
  return item && item.slot >= 36 && item.slot <= 44;
}

async function moveItemToHotbarAuto(itemName) {
  console.log(`[AUTO] Moving ${itemName} to hotbar...`);
  
  const items = bot.inventory.items();
  const item = items.find(i => i.name === itemName);
  
  if (!item) {
    console.log(`[AUTO] ${itemName} not found`);
    return false;
  }
  
  // Already in hotbar? Perfect!
  if (isItemInHotbar(item)) {
    console.log(`[AUTO] ${itemName} already in hotbar slot ${item.slot}`);
    return true;
  }
  
  // Try OP method first (instant)
  if (hasOp) {
    // Find empty hotbar slot
    for (let i = 36; i < 45; i++) {
      if (!bot.inventory.slots[i]) {
        const hotbarIndex = i - 36;
        bot.chat(`/replaceitem entity @s slot.hotbar.${hotbarIndex} ${itemName} 1`);
        console.log(`[AUTO] Used OP command to move ${itemName} to hotbar slot ${hotbarIndex}`);
        await delay(300);
        return true;
      }
    }
  }
  
  console.log(`[AUTO] ${itemName} needs manual move to hotbar`);
  return false;
}

// ---------------- AUTOMATIC HOLD & EQUIP ----------------
async function autoHoldAndEquip(itemName, slotName = null) {
  console.log(`[AUTO] Auto-hold and equip ${itemName}...`);
  
  // First ensure item is in hotbar
  await moveItemToHotbarAuto(itemName);
  await delay(200);
  
  // Find item in hotbar
  const items = bot.inventory.items();
  const item = items.find(i => i.name === itemName && isItemInHotbar(i));
  
  if (!item) {
    console.log(`[AUTO] ${itemName} not in hotbar after move attempt`);
    return false;
  }
  
  // Switch to that hotbar slot
  const hotbarIndex = item.slot - 36;
  bot.setQuickBarSlot(hotbarIndex);
  console.log(`[AUTO] Holding ${itemName} in hotbar slot ${hotbarIndex}`);
  
  // Do actions to trigger auto-equip
  await delay(200);
  
  // Jump (helps trigger equipment)
  bot.setControlState('jump', true);
  await delay(50);
  bot.setControlState('jump', false);
  
  // Look around
  await delay(100);
  bot.look(bot.entity.yaw + 0.3, bot.entity.pitch, false);
  await delay(100);
  bot.look(bot.entity.yaw - 0.3, bot.entity.pitch, false);
  await delay(100);
  
  // For armor, check if it auto-equipped
  const armorSlots = {
    'diamond_helmet': 5,
    'diamond_chestplate': 6,
    'diamond_leggings': 7,
    'diamond_boots': 8,
    'shield': 45
  };
  
  if (armorSlots[itemName]) {
    const checkSlot = armorSlots[itemName];
    await delay(300); // Wait for auto-equip
    
    const equipped = bot.inventory.slots[checkSlot];
    if (equipped && equipped.name === itemName) {
      console.log(`[AUTO] ✓ ${itemName} auto-equipped!`);
      return true;
    }
    
    // If not auto-equipped, try right-click
    console.log(`[AUTO] Trying right-click for ${itemName}...`);
    bot.activateItem();
    await delay(500);
    
    // Check again
    const equippedAfterClick = bot.inventory.slots[checkSlot];
    if (equippedAfterClick && equippedAfterClick.name === itemName) {
      console.log(`[AUTO] ✓ ${itemName} equipped with right-click!`);
      return true;
    }
  }
  
  // For sword, just holding is enough
  if (itemName.includes('sword')) {
    console.log(`[AUTO] ✓ Sword in hand`);
    return true;
  }
  
  return false;
}

// ---------------- FULLY AUTOMATIC EQUIPMENT SEQUENCE ----------------
async function automaticEquipmentSequence() {
  if (autoEquipInProgress) {
    console.log('[AUTO] Equipment sequence already in progress');
    return;
  }
  
  autoEquipInProgress = true;
  console.log('[AUTO] ===== STARTING AUTOMATIC EQUIPMENT =====');
  
  // Wait a moment for items to appear
  await delay(1000);
  
  const equipmentList = [
    // Armor (equip in this order for best results)
    { name: 'diamond_boots', type: 'armor' },
    { name: 'diamond_leggings', type: 'armor' },
    { name: 'diamond_chestplate', type: 'armor' },
    { name: 'diamond_helmet', type: 'armor' },
    // Weapons
    { name: 'diamond_sword', type: 'weapon' },
    { name: 'shield', type: 'shield' }
  ];
  
  let successCount = 0;
  
  for (const item of equipmentList) {
    console.log(`[AUTO] Processing ${item.name}...`);
    
    try {
      const success = await autoHoldAndEquip(item.name);
      if (success) successCount++;
      
      // Different delays for different item types
      if (item.type === 'armor') {
        await delay(600); // Longer delay for armor
      } else {
        await delay(400); // Shorter for weapons
      }
      
    } catch (error) {
      console.log(`[AUTO ERROR] ${item.name}: ${error.message}`);
    }
  }
  
  console.log(`[AUTO] ===== COMPLETE: ${successCount}/${equipmentList.length} equipped =====`);
  autoEquipInProgress = false;
  
  return successCount;
}

// ---------------- AUTO-EAT SYSTEM ----------------
function setupAutoSystems() {
  // Auto-eat when health is low
  setInterval(async () => {
    if (!bot || bot.health >= 10 || autoEquipInProgress) return;
    
    console.log(`[AUTO-HEAL] Low health: ${bot.health}`);
    
    const items = bot.inventory.items();
    const goldenApple = items.find(i => i.name === 'golden_apple' && isItemInHotbar(i));
    
    if (goldenApple) {
      const prevSlot = bot.quickBarSlot;
      const appleSlot = goldenApple.slot - 36;
      
      bot.setQuickBarSlot(appleSlot);
      bot.activateItem();
      console.log(`[AUTO-HEAL] Eating golden apple...`);
      
      // Wait for eating, then switch back to sword
      setTimeout(() => {
        const sword = items.find(i => i.name.includes('sword') && isItemInHotbar(i));
        if (sword) {
          bot.setQuickBarSlot(sword.slot - 36);
        } else {
          bot.setQuickBarSlot(prevSlot);
        }
      }, 2000);
    }
  }, 3000);
  
  // Auto-equip sword if dropped/lost
  setInterval(() => {
    if (!bot || autoEquipInProgress || pvpMode) return;
    
    // Check if holding sword
    if (!bot.heldItem || !bot.heldItem.name.includes('sword')) {
      const items = bot.inventory.items();
      const sword = items.find(i => i.name.includes('sword') && isItemInHotbar(i));
      
      if (sword) {
        const swordSlot = sword.slot - 36;
        if (bot.quickBarSlot !== swordSlot) {
          bot.setQuickBarSlot(swordSlot);
          console.log(`[AUTO] Auto-switched to sword`);
        }
      }
    }
  }, 5000);
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

  // ---------------- INVENTORY CHANGE DETECTOR ----------------
  bot.on('setSlot', (data) => {
    // When items are added to inventory, try to auto-equip
    if (data.item && !autoEquipInProgress) {
      const itemName = data.item.name;
      
      // Check if it's equipment we care about
      const equipmentItems = ['diamond_helmet', 'diamond_chestplate', 'diamond_leggings', 
                              'diamond_boots', 'diamond_sword', 'shield'];
      
      if (equipmentItems.includes(itemName)) {
        console.log(`[AUTO-DETECT] ${itemName} added to inventory`);
        
        // Small delay then try to equip
        setTimeout(() => {
          if (!autoEquipInProgress) {
            autoHoldAndEquip(itemName).catch(() => {});
          }
        }, 1000);
      }
    }
  });

  // ---------------- DETECT OP ----------------
  bot.on('message', (jsonMsg) => {
    const msg = jsonMsg.toString().toLowerCase();
    const botName = bot.username.toLowerCase();
    
    if (
      (msg.includes('opped') && msg.includes(botName)) ||
      (msg.includes('operator') && msg.includes(botName)) ||
      msg.includes('you are now op') ||
      (msg.includes('made') && msg.includes(botName) && msg.includes('op'))
    ) {
      if (!hasOp) {
        hasOp = true;
        opRequested = false;
        console.log('[OP] Granted!');
        if (mode === 'hard' && !kitGiven) {
          kitGiven = true;
          giveHardModeKit();
        }
      }
    }
  });

  // ---------------- CHAT COMMANDS ----------------
  bot.on('chat', async (user, msg) => {
    if (user === bot.username) return;
    const cmd = msg.toLowerCase().trim();

    if (['easy', 'normal', 'hard'].includes(cmd)) {
      mode = cmd;
      hasOp = false;
      opRequested = false;
      kitGiven = false;
      bot.chat(`Mode: ${mode.toUpperCase()}`);
      console.log('[MODE]', mode);
    }

    if (cmd === 'givekit') {
      hasOp = true;
      kitGiven = true;
      giveHardModeKit();
    }

    // Automatic equipment commands
    if (cmd === 'autoequip') {
      bot.chat('Starting automatic equipment...');
      await automaticEquipmentSequence();
      bot.chat('Automatic equipment complete!');
    }

    if (cmd === 'autosword') {
      await autoHoldAndEquip('diamond_sword');
      bot.chat(bot.heldItem && bot.heldItem.name.includes('sword') ? 'Sword equipped!' : 'Tried to equip sword');
    }

    // Quick manual commands (still work)
    if (cmd === 'holdchest') {
      await autoHoldAndEquip('diamond_chestplate');
      bot.chat('Chestplate action complete!');
    }

    if (cmd === 'holdboots') {
      await autoHoldAndEquip('diamond_boots');
      bot.chat('Boots action complete!');
    }

    if (cmd === 'opauto') {
      if (hasOp) {
        // Use OP commands for instant equipment
        bot.chat('/replaceitem entity @s armor.head diamond_helmet');
        bot.chat('/replaceitem entity @s armor.chest diamond_chestplate');
        bot.chat('/replaceitem entity @s armor.legs diamond_leggings');
        bot.chat('/replaceitem entity @s armor.feet diamond_boots');
        bot.chat('/replaceitem entity @s weapon.mainhand diamond_sword');
        bot.chat('/replaceitem entity @s weapon.offhand shield');
        bot.chat('OP auto-equip complete!');
      } else {
        bot.chat('Need OP for instant equip!');
      }
    }

    if (cmd === 'status') {
      const items = bot.inventory.items();
      const hotbarItems = items.filter(i => isItemInHotbar(i));
      
      bot.chat(`Health: ${bot.health} | Food: ${bot.food} | Items: ${items.length} | Hotbar: ${hotbarItems.length}`);
      
      // Show equipment
      let equipment = [];
      if (bot.inventory.slots[5]) equipment.push('Helmet');
      if (bot.inventory.slots[6]) equipment.push('Chest');
      if (bot.inventory.slots[7]) equipment.push('Legs');
      if (bot.inventory.slots[8]) equipment.push('Boots');
      if (bot.heldItem && bot.heldItem.name.includes('sword')) equipment.push('Sword');
      if (bot.inventory.slots[45]) equipment.push('Shield');
      
      if (equipment.length > 0) {
        bot.chat(`Equipped: ${equipment.join(', ')}`);
      }
    }

    if (cmd === 'debuginv') {
      const items = bot.inventory.items();
      console.log('[DEBUG] All items:', items.map(i => `${i.name} (slot ${i.slot}${isItemInHotbar(i) ? ' - HOTBAR' : ''})`).join(', '));
      
      console.log('[DEBUG] Equipment slots:');
      console.log(`  Helmet (5): ${bot.inventory.slots[5]?.name || 'empty'}`);
      console.log(`  Chest (6): ${bot.inventory.slots[6]?.name || 'empty'}`);
      console.log(`  Legs (7): ${bot.inventory.slots[7]?.name || 'empty'}`);
      console.log(`  Boots (8): ${bot.inventory.slots[8]?.name || 'empty'}`);
      console.log(`  Offhand (45): ${bot.inventory.slots[45]?.name || 'empty'}`);
      console.log(`  Held (hotbar ${bot.quickBarSlot}): ${bot.heldItem?.name || 'empty'}`);
      
      bot.chat('Debug info in console!');
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
    
    // Auto-ensure sword is equipped
    if (!bot.heldItem || !bot.heldItem.name.includes('sword')) {
      await autoHoldAndEquip('diamond_sword');
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
    if (bot.entity.onGround) {
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

// ---------------- HARD MODE KIT (NOW AUTOMATIC!) ----------------
async function giveHardModeKit() {
  if (!bot) return;
  console.log('[KIT] Giving kit...');

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
  await delay(2000);
  
  // AUTOMATIC EQUIPMENT STARTS HERE!
  console.log('[KIT] ===== STARTING AUTOMATIC EQUIPMENT =====');
  bot.chat('Auto-equipping items...');
  
  // Start automatic equipment sequence
  setTimeout(async () => {
    await automaticEquipmentSequence();
    bot.chat('Auto-equip complete! Ready for battle!');
  }, 1000);
}

// ---------------- RESET ----------------
function reset() {
  if (opCheckInterval) {
    clearInterval(opCheckInterval);
    opCheckInterval = null;
  }
  
  botRunning = false;
  pvpMode = false;
  currentTarget = null;
  hasOp = false;
  opRequested = false;
  kitGiven = false;
  autoEquipInProgress = false;

  console.log('[BOT] Reconnecting in 5s...');
  setTimeout(createBot, 5000);
}

// ---------------- START ----------------
createBot();
