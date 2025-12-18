//----------------------------------------------------
// PVP BOT - ULTIMATE NETHERITE ENCHANTED BOT
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

// ---------------- NETHERITE ENCHANTED EQUIPMENT LIST ----------------
const ULTIMATE_KIT = {
  // Netherite armor with maximum enchantments
  armor: [
    {
      name: 'netherite_helmet',
      enchantments: '{Enchantments:[{id:"protection",lvl:4},{id:"unbreaking",lvl:3},{id:"mending",lvl:1},{id:"respiration",lvl:3},{id:"aqua_affinity",lvl:1}]}'
    },
    {
      name: 'netherite_chestplate',
      enchantments: '{Enchantments:[{id:"protection",lvl:4},{id:"unbreaking",lvl:3},{id:"mending",lvl:1}]}'
    },
    {
      name: 'netherite_leggings',
      enchantments: '{Enchantments:[{id:"protection",lvl:4},{id:"unbreaking",lvl:3},{id:"mending",lvl:1},{id:"blast_protection",lvl:4}]}'
    },
    {
      name: 'netherite_boots',
      enchantments: '{Enchantments:[{id:"protection",lvl:4},{id:"unbreaking",lvl:3},{id:"mending",lvl:1},{id:"feather_falling",lvl:4},{id:"depth_strider",lvl:3}]}'
    }
  ],
  
  // Netherite tools with enchantments
  tools: [
    {
      name: 'netherite_sword',
      enchantments: '{Enchantments:[{id:"sharpness",lvl:5},{id:"unbreaking",lvl:3},{id:"mending",lvl:1},{id:"fire_aspect",lvl:2},{id:"knockback",lvl:2},{id:"looting",lvl:3}]}'
    },
    {
      name: 'netherite_pickaxe',
      enchantments: '{Enchantments:[{id:"efficiency",lvl:5},{id:"unbreaking",lvl:3},{id:"mending",lvl:1},{id:"fortune",lvl:3}]}'
    },
    {
      name: 'netherite_axe',
      enchantments: '{Enchantments:[{id:"sharpness",lvl:5},{id:"unbreaking",lvl:3},{id:"mending",lvl:1},{id:"efficiency",lvl:5}]}'
    },
    {
      name: 'netherite_shovel',
      enchantments: '{Enchantments:[{id:"efficiency",lvl:5},{id:"unbreaking",lvl:3},{id:"mending",lvl:1},{id:"fortune",lvl:3}]}'
    }
  ],
  
  // Other essential items
  items: [
    {
      name: 'shield',
      enchantments: '' // No enchantments for shield
    },
    {
      name: 'bow',
      enchantments: '{Enchantments:[{id:"power",lvl:5},{id:"unbreaking",lvl:3},{id:"mending",lvl:1},{id:"punch",lvl:2},{id:"flame",lvl:1},{id:"infinity",lvl:1}]}'
    },
    {
      name: 'crossbow',
      enchantments: '{Enchantments:[{id:"quick_charge",lvl:3},{id:"unbreaking",lvl:3},{id:"mending",lvl:1},{id:"multishot",lvl:1},{id:"piercing",lvl:4}]}'
    },
    {
      name: 'trident',
      enchantments: '{Enchantments:[{id:"loyalty",lvl:3},{id:"unbreaking",lvl:3},{id:"mending",lvl:1},{id:"impaling",lvl:5},{id:"channeling",lvl:1}]}'
    }
  ],
  
  // Consumables
  consumables: [
    { name: 'ender_pearl', count: 64 },
    { name: 'enchanted_golden_apple', count: 32 },
    { name: 'golden_apple', count: 64 },
    { name: 'arrow', count: 64 },
    { name: 'spectral_arrow', count: 64 },
    { name: 'splash_potion_of_healing', count: 16 },
    { name: 'splash_potion_of_regeneration', count: 16 },
    { name: 'splash_potion_of_strength', count: 16 },
    { name: 'splash_potion_of_swiftness', count: 16 },
    { name: 'totem_of_undying', count: 16 },
    { name: 'ender_chest', count: 4 },
    { name: 'shulker_box', count: 16 }
  ]
};

// ---------------- HOTBAR MANAGEMENT ----------------
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
  
  if (isItemInHotbar(item)) {
    console.log(`[AUTO] ${itemName} already in hotbar slot ${item.slot}`);
    return true;
  }
  
  if (hasOp) {
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

// ---------------- AUTO HOLD & EQUIP ----------------
async function autoHoldAndEquip(itemName, slotName = null) {
  console.log(`[AUTO] Auto-hold and equip ${itemName}...`);
  
  await moveItemToHotbarAuto(itemName);
  await delay(200);
  
  const items = bot.inventory.items();
  const item = items.find(i => i.name === itemName && isItemInHotbar(i));
  
  if (!item) {
    console.log(`[AUTO] ${itemName} not in hotbar after move attempt`);
    return false;
  }
  
  const hotbarIndex = item.slot - 36;
  bot.setQuickBarSlot(hotbarIndex);
  console.log(`[AUTO] Holding ${itemName} in hotbar slot ${hotbarIndex}`);
  
  await delay(200);
  
  bot.setControlState('jump', true);
  await delay(50);
  bot.setControlState('jump', false);
  
  await delay(100);
  bot.look(bot.entity.yaw + 0.3, bot.entity.pitch, false);
  await delay(100);
  bot.look(bot.entity.yaw - 0.3, bot.entity.pitch, false);
  await delay(100);
  
  const armorSlots = {
    'netherite_helmet': 5,
    'netherite_chestplate': 6,
    'netherite_leggings': 7,
    'netherite_boots': 8,
    'shield': 45
  };
  
  if (armorSlots[itemName]) {
    const checkSlot = armorSlots[itemName];
    await delay(300);
    
    const equipped = bot.inventory.slots[checkSlot];
    if (equipped && equipped.name === itemName) {
      console.log(`[AUTO] ✓ ${itemName} auto-equipped!`);
      return true;
    }
    
    console.log(`[AUTO] Trying right-click for ${itemName}...`);
    bot.activateItem();
    await delay(500);
    
    const equippedAfterClick = bot.inventory.slots[checkSlot];
    if (equippedAfterClick && equippedAfterClick.name === itemName) {
      console.log(`[AUTO] ✓ ${itemName} equipped with right-click!`);
      return true;
    }
  }
  
  if (itemName.includes('sword')) {
    console.log(`[AUTO] ✓ Sword in hand`);
    return true;
  }
  
  return false;
}

// ---------------- ULTIMATE EQUIPMENT SEQUENCE ----------------
async function ultimateEquipmentSequence() {
  if (autoEquipInProgress) {
    console.log('[ULTIMATE] Equipment sequence already in progress');
    return;
  }
  
  autoEquipInProgress = true;
  console.log('[ULTIMATE] ===== STARTING ULTIMATE EQUIPMENT SEQUENCE =====');
  
  await delay(1500);
  
  const equipmentPriority = [
    // Core combat gear first
    { name: 'netherite_boots', type: 'armor' },
    { name: 'netherite_leggings', type: 'armor' },
    { name: 'netherite_chestplate', type: 'armor' },
    { name: 'netherite_helmet', type: 'armor' },
    { name: 'netherite_sword', type: 'weapon' },
    { name: 'shield', type: 'shield' },
    { name: 'bow', type: 'ranged' },
    { name: 'crossbow', type: 'ranged' },
    { name: 'trident', type: 'ranged' }
  ];
  
  let successCount = 0;
  
  for (const item of equipmentPriority) {
    console.log(`[ULTIMATE] Equipping ${item.name}...`);
    
    try {
      const success = await autoHoldAndEquip(item.name);
      if (success) successCount++;
      
      switch(item.type) {
        case 'armor': await delay(700); break;
        case 'weapon': await delay(500); break;
        default: await delay(400); break;
      }
      
    } catch (error) {
      console.log(`[ULTIMATE ERROR] ${item.name}: ${error.message}`);
    }
  }
  
  console.log(`[ULTIMATE] ===== COMPLETE: ${successCount}/${equipmentPriority.length} equipped =====`);
  autoEquipInProgress = false;
  
  return successCount;
}

// ---------------- ENHANCED AUTO SYSTEMS ----------------
function setupUltimateSystems() {
  // Enhanced auto-heal with potions
  setInterval(async () => {
    if (!bot || autoEquipInProgress) return;
    
    // Emergency heal if very low
    if (bot.health < 6) {
      console.log(`[EMERGENCY] Critical health: ${bot.health}`);
      
      const items = bot.inventory.items();
      const totem = items.find(i => i.name === 'totem_of_undying' && isItemInHotbar(i));
      const gapple = items.find(i => i.name === 'enchanted_golden_apple' && isItemInHotbar(i));
      const potion = items.find(i => i.name.includes('potion_of_healing') && isItemInHotbar(i));
      
      if (totem) {
        const prevSlot = bot.quickBarSlot;
        const totemSlot = totem.slot - 36;
        bot.setQuickBarSlot(totemSlot);
        bot.activateItem();
        console.log(`[EMERGENCY] Using totem of undying!`);
        setTimeout(() => bot.setQuickBarSlot(prevSlot), 1000);
      } else if (gapple) {
        const prevSlot = bot.quickBarSlot;
        const appleSlot = gapple.slot - 36;
        bot.setQuickBarSlot(appleSlot);
        bot.activateItem();
        console.log(`[EMERGENCY] Eating enchanted golden apple!`);
        setTimeout(() => bot.setQuickBarSlot(prevSlot), 3000);
      } else if (potion) {
        const prevSlot = bot.quickBarSlot;
        const potionSlot = potion.slot - 36;
        bot.setQuickBarSlot(potionSlot);
        bot.activateItem();
        console.log(`[EMERGENCY] Drinking healing potion!`);
        setTimeout(() => bot.setQuickBarSlot(prevSlot), 2000);
      }
    }
    // Normal heal
    else if (bot.health < 12) {
      const items = bot.inventory.items();
      const gapple = items.find(i => i.name === 'golden_apple' && isItemInHotbar(i));
      
      if (gapple) {
        const prevSlot = bot.quickBarSlot;
        const appleSlot = gapple.slot - 36;
        bot.setQuickBarSlot(appleSlot);
        bot.activateItem();
        console.log(`[HEAL] Eating golden apple`);
        setTimeout(() => bot.setQuickBarSlot(prevSlot), 2000);
      }
    }
  }, 2000);
  
  // Auto weapon switch based on distance
  setInterval(() => {
    if (!bot || autoEquipInProgress || pvpMode || !currentTarget) return;
    
    const distance = bot.entity.position.distanceTo(currentTarget.position);
    const items = bot.inventory.items();
    
    // Switch to bow if target is far
    if (distance > 8) {
      const bow = items.find(i => i.name === 'bow' && isItemInHotbar(i));
      if (bow && (!bot.heldItem || bot.heldItem.name !== 'bow')) {
        const bowSlot = bow.slot - 36;
        bot.setQuickBarSlot(bowSlot);
        console.log(`[AUTO-SWITCH] Switched to bow (distance: ${distance.toFixed(1)})`);
      }
    }
    // Switch to sword if target is close
    else if (distance <= 3) {
      const sword = items.find(i => i.name.includes('sword') && isItemInHotbar(i));
      if (sword && (!bot.heldItem || !bot.heldItem.name.includes('sword'))) {
        const swordSlot = sword.slot - 36;
        bot.setQuickBarSlot(swordSlot);
        console.log(`[AUTO-SWITCH] Switched to sword (distance: ${distance.toFixed(1)})`);
      }
    }
  }, 1000);
  
  // Auto replenish hotbar items
  setInterval(() => {
    if (!bot || autoEquipInProgress) return;
    
    const items = bot.inventory.items();
    const hotbarItems = items.filter(i => isItemInHotbar(i));
    
    // Check if we have empty hotbar slots
    let emptySlots = 0;
    for (let i = 36; i < 45; i++) {
      if (!bot.inventory.slots[i]) emptySlots++;
    }
    
    // Fill empty slots with useful items
    if (emptySlots > 0 && hasOp) {
      const usefulItems = ['ender_pearl', 'golden_apple', 'splash_potion_of_healing', 'totem_of_undying'];
      
      for (const itemName of usefulItems) {
        const item = items.find(i => i.name === itemName && !isItemInHotbar(i));
        if (item && emptySlots > 0) {
          for (let i = 36; i < 45; i++) {
            if (!bot.inventory.slots[i]) {
              const hotbarIndex = i - 36;
              bot.chat(`/replaceitem entity @s slot.hotbar.${hotbarIndex} ${itemName} 1`);
              emptySlots--;
              break;
            }
          }
        }
      }
    }
  }, 10000);
}

// ---------------- ULTIMATE NETHERITE KIT ----------------
async function giveUltimateNetheriteKit() {
  if (!bot) return;
  console.log('[ULTIMATE] Giving ULTIMATE Netherite Enchanted Kit...');
  
  bot.chat('Preparing ULTIMATE Netherite kit...');
  
  // Clear inventory first
  if (hasOp) {
    bot.chat('/clear');
    await delay(1000);
  }
  
  // Give Netherite armor with enchantments
  console.log('[ULTIMATE] Giving enchanted Netherite armor...');
  for (const armor of ULTIMATE_KIT.armor) {
    if (armor.enchantments) {
      bot.chat(`/give @s ${armor.name}${armor.enchantments} 1`);
    } else {
      bot.chat(`/give @s ${armor.name} 1`);
    }
    await delay(400);
  }
  
  // Give Netherite tools with enchantments
  console.log('[ULTIMATE] Giving enchanted Netherite tools...');
  for (const tool of ULTIMATE_KIT.tools) {
    if (tool.enchantments) {
      bot.chat(`/give @s ${tool.name}${tool.enchantments} 1`);
    } else {
      bot.chat(`/give @s ${tool.name} 1`);
    }
    await delay(400);
  }
  
  // Give other items
  console.log('[ULTIMATE] Giving other items...');
  for (const item of ULTIMATE_KIT.items) {
    if (item.enchantments) {
      bot.chat(`/give @s ${item.name}${item.enchantments} 1`);
    } else {
      bot.chat(`/give @s ${item.name} 1`);
    }
    await delay(400);
  }
  
  // Give consumables
  console.log('[ULTIMATE] Giving consumables...');
  for (const consumable of ULTIMATE_KIT.consumables) {
    bot.chat(`/give @s ${consumable.name} ${consumable.count}`);
    await delay(300);
  }
  
  // Special commands for ultimate kit
  if (hasOp) {
    console.log('[ULTIMATE] Applying ultimate effects...');
    bot.chat('/effect give @s strength 1000000 1');
    bot.chat('/effect give @s regeneration 1000000 1');
    bot.chat('/effect give @s resistance 1000000 1');
    bot.chat('/effect give @s speed 1000000 1');
    bot.chat('/effect give @s jump_boost 1000000 2');
    await delay(1000);
  }
  
  console.log('[ULTIMATE] Kit complete! Starting auto-equip...');
  bot.chat('ULTIMATE Netherite kit delivered! Auto-equipping...');
  
  // Start automatic equipment
  setTimeout(async () => {
    await ultimateEquipmentSequence();
    bot.chat('ULTIMATE equipment complete! I am unstoppable! ⚔️');
  }, 2000);
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

    setupUltimateSystems();

    if (opCheckInterval) clearInterval(opCheckInterval);
    opCheckInterval = setInterval(() => {
      if (mode === 'hard' && !hasOp && !opRequested) {
        bot.chat('admin please give me operator');
        opRequested = true;
      }
    }, 15000);
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
          giveUltimateNetheriteKit();
        }
      }
    }
  });

  // ---------------- CHAT COMMANDS ----------------
  bot.on('chat', async (user, msg) => {
    if (user === bot.username) return;
    const cmd = msg.toLowerCase().trim();

    if (['easy', 'normal', 'hard', 'ultimate'].includes(cmd)) {
      mode = cmd;
      hasOp = false;
      opRequested = false;
      kitGiven = false;
      bot.chat(`Mode: ${mode.toUpperCase()}`);
      console.log('[MODE]', mode);
    }

    if (cmd === 'givekit' || cmd === 'ultimatesetup') {
      hasOp = true;
      kitGiven = true;
      giveUltimateNetheriteKit();
    }

    if (cmd === 'netheritesetup') {
      hasOp = true;
      kitGiven = true;
      giveUltimateNetheriteKit();
    }

    if (cmd === 'autoequip') {
      bot.chat('Starting ultimate equipment sequence...');
      await ultimateEquipmentSequence();
      bot.chat('Ultimate equipment complete!');
    }

    if (cmd === 'opinstant') {
      if (hasOp) {
        // Instant OP equipment setup
        bot.chat('/replaceitem entity @s armor.head netherite_helmet{Enchantments:[{id:"protection",lvl:4}]}');
        bot.chat('/replaceitem entity @s armor.chest netherite_chestplate{Enchantments:[{id:"protection",lvl:4}]}');
        bot.chat('/replaceitem entity @s armor.legs netherite_leggings{Enchantments:[{id:"protection",lvl:4}]}');
        bot.chat('/replaceitem entity @s armor.feet netherite_boots{Enchantments:[{id:"protection",lvl:4},{id:"feather_falling",lvl:4}]}');
        bot.chat('/replaceitem entity @s weapon.mainhand netherite_sword{Enchantments:[{id:"sharpness",lvl:5}]}');
        bot.chat('/replaceitem entity @s weapon.offhand shield');
        bot.chat('Instant OP equipment applied!');
      } else {
        bot.chat('Need OP for instant setup!');
      }
    }

    if (cmd === 'status') {
      const items = bot.inventory.items();
      const netheriteItems = items.filter(i => i.name.includes('netherite'));
      const enchantedItems = items.filter(i => i.name.includes('netherite') || i.name.includes('enchanted'));
      
      bot.chat(`⚔️ ULTIMATE STATUS ⚔️`);
      bot.chat(`Health: ${bot.health}❤ | Food: ${bot.food}🍖`);
      bot.chat(`Netherite: ${netheriteItems.length} | Enchanted: ${enchantedItems.length}`);
      
      // Show equipped gear
      let gear = [];
      if (bot.inventory.slots[5] && bot.inventory.slots[5].name.includes('netherite')) gear.push('Netherite Helmet');
      if (bot.inventory.slots[6] && bot.inventory.slots[6].name.includes('netherite')) gear.push('Netherite Chest');
      if (bot.inventory.slots[7] && bot.inventory.slots[7].name.includes('netherite')) gear.push('Netherite Legs');
      if (bot.inventory.slots[8] && bot.inventory.slots[8].name.includes('netherite')) gear.push('Netherite Boots');
      if (bot.heldItem && bot.heldItem.name.includes('netherite')) gear.push('Netherite ' + bot.heldItem.name.split('_')[1]);
      
      if (gear.length > 0) {
        bot.chat(`Equipped: ${gear.join(', ')}`);
      }
    }

    if (cmd === 'inventory') {
      const items = bot.inventory.items();
      const netherite = items.filter(i => i.name.includes('netherite'));
      const enchanted = items.filter(i => i.name.includes('netherite') || i.name.includes('enchanted'));
      const potions = items.filter(i => i.name.includes('potion'));
      const apples = items.filter(i => i.name.includes('apple'));
      
      console.log('[INVENTORY] Netherite items:', netherite.map(i => i.name).join(', '));
      console.log('[INVENTORY] Potions:', potions.length);
      console.log('[INVENTORY] Apples:', apples.length);
      
      bot.chat(`📦 Inventory: ${items.length} items`);
      bot.chat(`Netherite: ${netherite.length} | Potions: ${potions.length} | Apples: ${apples.length}`);
    }

    if (cmd === 'effects') {
      if (hasOp) {
        bot.chat('/effect give @s strength 999999 2');
        bot.chat('/effect give @s regeneration 999999 2');
        bot.chat('/effect give @s resistance 999999 2');
        bot.chat('/effect give @s speed 999999 2');
        bot.chat('Ultimate effects applied!');
      }
    }

    if (cmd === 'pvp') {
      if (currentTarget) {
        bot.chat(`Already fighting ${currentTarget.username}!`);
      } else {
        const nearestPlayer = bot.players[Object.keys(bot.players).find(name => name !== bot.username)];
        if (nearestPlayer) {
          currentTarget = nearestPlayer.entity;
          pvpMode = true;
          startPvP();
          bot.chat(`Engaging ${nearestPlayer.username} in combat! ⚔️`);
        } else {
          bot.chat('No players nearby to fight!');
        }
      }
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
      e.position.distanceTo(bot.entity.position) < 10
    );

    if (attacker && !pvpMode) {
      console.log('[PVP] Attacked by', attacker.username);
      currentTarget = attacker;
      pvpMode = true;
      startPvP();
      bot.chat(`Under attack! Engaging ${attacker.username}!`);
    }
  });

  // ---------------- ENHANCED PVP ----------------
  async function startPvP() {
    if (!currentTarget) return;
    
    console.log('[PVP] Ultimate combat engaged!');
    
    // Ensure best weapon for distance
    const distance = bot.entity.position.distanceTo(currentTarget.position);
    const items = bot.inventory.items();
    
    if (distance > 6) {
      const bow = items.find(i => i.name === 'bow' && isItemInHotbar(i));
      if (bow) {
        const bowSlot = bow.slot - 36;
        bot.setQuickBarSlot(bowSlot);
      }
    } else {
      const sword = items.find(i => i.name.includes('sword') && isItemInHotbar(i));
      if (sword) {
        const swordSlot = sword.slot - 36;
        bot.setQuickBarSlot(swordSlot);
      }
    }
    
    try {
      bot.pvp.attack(currentTarget);
    } catch (e) {
      console.log('[PVP] Error:', e.message);
    }
  }

  // ---------------- ENHANCED COMBAT ----------------
  bot.on('physicsTick', () => {
    if (!pvpMode || !currentTarget) return;
    
    const distance = bot.entity.position.distanceTo(currentTarget.position);
    
    // Smart movement based on weapon
    if (distance > 6 && bot.heldItem && bot.heldItem.name === 'bow') {
      // Bow tactics: strafe while shooting
      bot.setControlState('sprint', false);
      bot.setControlState('back', distance < 15);
      const time = Date.now() / 1000;
      bot.setControlState(time % 2 < 1 ? 'left' : 'right', true);
    } else {
      // Sword tactics: aggressive
      bot.setControlState('sprint', true);
      bot.setControlState('forward', true);
      bot.setControlState('back', false);
      bot.setControlState('left', false);
      bot.setControlState('right', false);
    }
    
    // Jump timing
    if (bot.entity.onGround && Math.random() < 0.1) {
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 100);
    }
    
    // Use potions if low health
    if (bot.health < 10 && Math.random() < 0.05) {
      const items = bot.inventory.items();
      const potion = items.find(i => i.name.includes('potion_of_healing') && isItemInHotbar(i));
      if (potion) {
        const prevSlot = bot.quickBarSlot;
        const potionSlot = potion.slot - 36;
        bot.setQuickBarSlot(potionSlot);
        bot.activateItem();
        setTimeout(() => bot.setQuickBarSlot(prevSlot), 1000);
      }
    }
  });

  // ---------------- TARGET GONE ----------------
  bot.on('entityGone', (entity) => {
    if (currentTarget && entity.id === currentTarget.id) {
      console.log('[PVP] Target eliminated');
      bot.chat('Target eliminated! ⚔️');
      pvpMode = false;
      currentTarget = null;
      try { bot.pvp.stop(); } catch {}
      bot.clearControlStates();
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
