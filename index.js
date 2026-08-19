const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const Movements = require('mineflayer-pathfinder').Movements;
const pvp = require('mineflayer-pvp').plugin;
const crafting = require('mineflayer-crafting').plugin;
const fs = require('fs');
const path = require('path');

// Логирование
const logFile = path.join(__dirname, 'bot_log.txt');

function logMessage(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    console.log(logEntry.trim());
    fs.appendFileSync(logFile, logEntry);
}

// Словарь-транслятор команд
const commandTranslator = {
    'дабудь': 'mineResource',
    'добуд': 'mineResource',
    'накопай': 'mineResource',
    'скрафти': 'craftItem',
    'скрафт': 'craftItem',
    'построй дом': 'buildHouse',
    'хата': 'buildHouse',
    'построй форт': 'buildFort',
    'крепость': 'buildFort',
    'копай шахту': 'mineShaft',
    'защити': 'defend',
    'на помощь': 'defend',
    'стоп': 'stopAll',
    'стой': 'stopAll',
    'все ко мне': 'comeHere',
    'дай ресурс': 'giveResource',
    'статус': 'showStatus'
};

class BotPlayer {
    constructor(name, index) {
        this.name = name;
        this.index = index;
        this.bot = null;
        this.connected = false;
        this.isRunning = true;
        this.currentNeed = null;
        this.needTimer = null;
        this.target = null;
        this.isBuilding = false;
        
        // Генерация характера
        this.personality = {
            aggressiveness: Math.floor(Math.random() * 101),
            cowardice: Math.floor(Math.random() * 101),
            industriousness: Math.floor(Math.random() * 101),
            chatty: Math.floor(Math.random() * 101),
            building_skill: Math.floor(Math.random() * 101),
            favorite_block: ['oak_planks', 'stone', 'dirt', 'cobblestone', 'wood'][Math.floor(Math.random() * 5)]
        };
        
        this.needs = ['HUNGER', 'SLEEP', 'RESOURCE', 'BUILD', 'EXPLORE', 'REST'];
        this.shelterPosition = null;
        this.combatTarget = null;
        this.following = false;
        
        this.initBot();
        this.startNeedCycle();
    }
    
    initBot() {
        this.bot = mineflayer.createBot({
            host: 'localhost',
            port: 53305,
            username: this.name,
            version: '1.19.2'
        });
        
        this.bot.loadPlugin(pathfinder);
        this.bot.loadPlugin(pvp);
        this.bot.loadPlugin(crafting);
        
        this.bot.on('login', () => {
            this.connected = true;
            logMessage(`${this.name} подключился к серверу`);
            this.setupPathfinder();
            this.bot.chat(`Привет! Я бот ${this.name}`);
            this.bot.chat(`Мой характер: агрессивность ${this.personality.aggressiveness}, трусость ${this.personality.cowardice}`);
        });
        
        this.bot.on('error', (err) => {
            logMessage(`${this.name} ошибка: ${err.message}`);
            this.connected = false;
            setTimeout(() => this.reconnect(), 5000);
        });
        
        this.bot.on('end', () => {
            logMessage(`${this.name} отключился`);
            this.connected = false;
            setTimeout(() => this.reconnect(), 5000);
        });
        
        this.bot.on('chat', (username, message) => {
            if (username === 'LTTBoomza') {
                this.handleCommand(message, username);
            }
            
            // Обработка упоминаний
            if (message.includes(this.name) && message.includes('помоги')) {
                this.helpOtherBot(username);
            }
        });
        
        this.bot.on('entityHurt', (entity) => {
            if (entity.username === this.name) {
                this.handleAttacked(entity);
            }
            if (entity.username === 'LTTBoomza') {
                this.handleLTTBoomzaAttacked(entity);
            }
        });
        
        this.bot.on('health', () => {
            this.handleHealth();
        });
        
        this.bot.on('time', () => {
            this.handleTime();
        });
        
        this.bot.on('spawn', () => {
            this.shelterPosition = this.bot.entity.position;
        });
    }
    
    reconnect() {
        if (this.isRunning && !this.connected) {
            logMessage(`${this.name} переподключение...`);
            this.initBot();
        }
    }
    
    setupPathfinder() {
        const mcData = require('minecraft-data')(this.bot.version);
        const defaultMove = new Movements(this.bot, mcData);
        this.bot.pathfinder.setMovements(defaultMove);
    }
    
    startNeedCycle() {
        this.needTimer = setInterval(() => {
            if (this.connected) {
                this.updateNeed();
            }
        }, Math.floor(Math.random() * 5 + 5) * 60000); // 5-10 минут
    }
    
    updateNeed() {
        this.currentNeed = this.needs[Math.floor(Math.random() * this.needs.length)];
        logMessage(`${this.name} нуждается в: ${this.currentNeed}`);
        this.actOnNeed();
    }
    
    actOnNeed() {
        if (!this.bot || !this.connected) return;
        
        switch(this.currentNeed) {
            case 'HUNGER':
                this.findFood();
                break;
            case 'SLEEP':
                if (this.bot.time.timeOfDay > 13000 && this.bot.time.timeOfDay < 24000) {
                    this.goToBed();
                }
                break;
            case 'RESOURCE':
                this.mineResource();
                break;
            case 'BUILD':
                this.buildHouse();
                break;
            case 'EXPLORE':
                this.explore();
                break;
            case 'REST':
                this.rest();
                break;
        }
    }
    
    handleCommand(message, username) {
        const lowerMsg = message.toLowerCase();
        let command = lowerMsg;
        
        // Проверка на конкретного бота
        if (lowerMsg.includes('бот ')) {
            const parts = lowerMsg.split(' ');
            const botName = parts[1];
            if (botName === this.name.toLowerCase()) {
                command = parts.slice(2).join(' ');
                this.executeCommand(command, username);
            }
            return;
        }
        
        // Команда всем ботам
        this.executeCommand(lowerMsg, username);
    }
    
    executeCommand(command, username) {
        logMessage(`${this.name} получил команду: ${command} от ${username}`);
        
        // Трансляция команды
        let translatedCommand = command;
        for (const [key, value] of Object.entries(commandTranslator)) {
            if (command.includes(key)) {
                translatedCommand = value;
                break;
            }
        }
        
        switch(translatedCommand) {
            case 'mineResource':
                this.mineResource();
                break;
            case 'craftItem':
                this.craftItem();
                break;
            case 'buildHouse':
                this.buildHouse();
                break;
            case 'buildFort':
                this.buildFort();
                break;
            case 'mineShaft':
                this.mineShaft();
                break;
            case 'defend':
                this.defend(username);
                break;
            case 'stopAll':
                this.stopAll();
                break;
            case 'comeHere':
                this.comeHere(username);
                break;
            case 'giveResource':
                this.giveResource(username);
                break;
            case 'showStatus':
                this.showStatus();
                break;
            default:
                if (command.includes('построй')) {
                    this.buildStructure(command);
                }
        }
    }
    
    async mineResource() {
        try {
            const blocks = this.bot.findBlocks({
                matching: ['coal_ore', 'iron_ore', 'diamond_ore', 'stone'],
                maxDistance: 32,
                count: 10
            });
            
            if (blocks.length > 0) {
                const target = blocks[0];
                await this.bot.pathfinder.goto(target);
                await this.bot.dig(target);
                logMessage(`${this.name} добыл ресурс на ${target.x}, ${target.y}, ${target.z}`);
            }
        } catch (err) {
            logMessage(`${this.name} ошибка при добыче: ${err.message}`);
        }
    }
    
    async craftItem() {
        try {
            const recipes = this.bot.recipesFor('wooden_pickaxe', null, 1);
            if (recipes.length > 0) {
                await this.bot.craft(recipes[0], 1);
                logMessage(`${this.name} скрафтил деревянную кирку`);
            }
        } catch (err) {
            logMessage(`${this.name} ошибка крафта: ${err.message}`);
        }
    }
    
    async buildHouse() {
        if (this.isBuilding) return;
        this.isBuilding = true;
        
        try {
            const pos = this.bot.entity.position;
            const startX = Math.floor(pos.x) + 2;
            const startZ = Math.floor(pos.z) + 2;
            const height = 3;
            
            logMessage(`${this.name} строит дом на ${startX}, ${Math.floor(pos.y)}, ${startZ}`);
            
            // Стены
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < 5; x++) {
                    for (let z = 0; z < 5; z++) {
                        if (x === 0 || x === 4 || z === 0 || z === 4 || y === 0) {
                            const target = {
                                x: startX + x,
                                y: Math.floor(pos.y) + y,
                                z: startZ + z
                            };
                            await this.bot.pathfinder.goto(target);
                            await this.bot.placeBlock(target, 'oak_planks');
                        }
                    }
                }
            }
            
            // Дверь
            const doorPos = {
                x: startX + 2,
                y: Math.floor(pos.y),
                z: startZ
            };
            await this.bot.pathfinder.goto(doorPos);
            await this.bot.placeBlock(doorPos, 'oak_door');
            
            this.bot.chat('Дом построен!');
            logMessage(`${this.name} построил дом`);
        } catch (err) {
            logMessage(`${this.name} ошибка при строительстве дома: ${err.message}`);
        }
        
        this.isBuilding = false;
    }
    
    async buildFort() {
        if (this.isBuilding) return;
        this.isBuilding = true;
        
        try {
            const pos = this.bot.entity.position;
            const startX = Math.floor(pos.x) + 2;
            const startZ = Math.floor(pos.z) + 2;
            
            logMessage(`${this.name} строит форт на ${startX}, ${Math.floor(pos.y)}, ${startZ}`);
            
            // Стены толщиной 2 блока
            for (let y = 0; y < 6; y++) {
                for (let x = 0; x < 7; x++) {
                    for (let z = 0; z < 7; z++) {
                        if (x < 2 || x > 4 || z < 2 || z > 4 || y === 0 || y === 5) {
                            const target = {
                                x: startX + x,
                                y: Math.floor(pos.y) + y,
                                z: startZ + z
                            };
                            await this.bot.pathfinder.goto(target);
                            await this.bot.placeBlock(target, 'cobblestone');
                        }
                    }
                }
            }
            
            this.bot.chat('Форт построен!');
            logMessage(`${this.name} построил форт`);
        } catch (err) {
            logMessage(`${this.name} ошибка при строительстве форта: ${err.message}`);
        }
        
        this.isBuilding = false;
    }
    
    async mineShaft() {
        try {
            const pos = this.bot.entity.position;
            const startX = Math.floor(pos.x);
            const startZ = Math.floor(pos.z);
            
            for (let y = 0; y < 10; y++) {
                const target = {
                    x: startX,
                    y: Math.floor(pos.y) - y,
                    z: startZ
                };
                await this.bot.pathfinder.goto(target);
                await this.bot.dig(target);
            }
            
            this.bot.chat('Шахта готова!');
            logMessage(`${this.name} выкопал шахту`);
        } catch (err) {
            logMessage(`${this.name} ошибка при копке шахты: ${err.message}`);
        }
    }
    
    defend(username) {
        const player = this.bot.players[username];
        if (player && player.entity) {
            this.target = player.entity;
            this.attackTarget();
        }
    }
    
    attackTarget() {
        if (!this.target) return;
        
        this.bot.pvp.attack(this.target);
        logMessage(`${this.name} атакует ${this.target.username}`);
        
        setTimeout(() => {
            if (this.target && this.target.health > 0) {
                this.attackTarget();
            } else {
                this.bot.pvp.stop();
                this.target = null;
            }
        }, 1000);
    }
    
    handleAttacked(entity) {
        if (entity && entity.username !== this.name && this.bot.health > 5) {
            this.target = entity;
            this.attackTarget();
            logMessage(`${this.name} атакует обидчика ${entity.username}`);
        }
    }
    
    handleLTTBoomzaAttacked(entity) {
        if (entity && entity.username === 'LTTBoomza') {
            logMessage(`${this.name} спешит на помощь LTTBoomza!`);
            this.target = entity;
            this.attackTarget();
            
            // Зовём других ботов
            this.bot.chat('LTTBoomza в опасности! Все на помощь!');
        }
    }
    
    handleHealth() {
        if (this.bot.health < 5 && this.shelterPosition) {
            this.bot.pathfinder.goto(this.shelterPosition);
            logMessage(`${this.name} прячется в убежище (HP: ${this.bot.health})`);
        }
        
        if (this.bot.food < 3) {
            this.findFood();
        }
    }
    
    handleTime() {
        if (this.bot.time.timeOfDay > 13000 && this.bot.time.timeOfDay < 24000) {
            if (this.bot.health < 10) {
                this.buildShelter();
            }
        }
    }
    
    async findFood() {
        try {
            const animals = this.bot.entities.filter(e => 
                e.type === 'mob' && ['cow', 'pig', 'chicken', 'sheep'].includes(e.name)
            );
            
            if (animals.length > 0) {
                const target = animals[0];
                await this.bot.pathfinder.goto(target.position);
                this.bot.attack(target);
                logMessage(`${this.name} охотится на ${target.name}`);
            }
        } catch (err) {
            logMessage(`${this.name} ошибка при поиске еды: ${err.message}`);
        }
    }
    
    async goToBed() {
        try {
            const bed = this.bot.findBlock({
                matching: ['bed'],
                maxDistance: 16
            });
            
            if (bed) {
                await this.bot.pathfinder.goto(bed.position);
                await this.bot.sleep(bed);
                logMessage(`${this.name} лёг спать`);
            }
        } catch (err) {
            logMessage(`${this.name} ошибка при сне: ${err.message}`);
        }
    }
    
    async buildShelter() {
        try {
            const pos = this.bot.entity.position;
            const shelterPos = {
                x: Math.floor(pos.x),
                y: Math.floor(pos.y),
                z: Math.floor(pos.z)
            };
            
            await this.bot.placeBlock(shelterPos, 'oak_planks');
            await this.bot.placeBlock({
                x: shelterPos.x,
                y: shelterPos.y + 1,
                z: shelterPos.z
            }, 'torch');
            
            logMessage(`${this.name} построил убежище`);
        } catch (err) {
            logMessage(`${this.name} ошибка при строительстве убежища: ${err.message}`);
        }
    }
    
    async buildStructure(command) {
        if (command.includes('башня')) {
            await this.buildTower();
        }
    }
    
    async buildTower() {
        try {
            const pos = this.bot.entity.position;
            const startX = Math.floor(pos.x);
            const startZ = Math.floor(pos.z);
            
            for (let y = 0; y < 5; y++) {
                for (let x = 0; x < 3; x++) {
                    for (let z = 0; z < 3; z++) {
                        if (x === 0 || x === 2 || z === 0 || z === 2) {
                            const target = {
                                x: startX + x,
                                y: Math.floor(pos.y) + y,
                                z: startZ + z
                            };
                            await this.bot.pathfinder.goto(target);
                            await this.bot.placeBlock(target, 'cobblestone');
                        }
                    }
                }
            }
            
            this.bot.chat('Башня построена!');
        } catch (err) {
            logMessage(`${this.name} ошибка при строительстве башни: ${err.message}`);
        }
    }
    
    explore() {
        const randomX = Math.floor(Math.random() * 50) - 25;
        const randomZ = Math.floor(Math.random() * 50) - 25;
        const pos = this.bot.entity.position;
        
        this.bot.pathfinder.goto({
            x: Math.floor(pos.x) + randomX,
            y: Math.floor(pos.y),
            z: Math.floor(pos.z) + randomZ
        });
        
        logMessage(`${this.name} исследует область`);
    }
    
    rest() {
        logMessage(`${this.name} отдыхает`);
        // Просто стоим на месте
    }
    
    stopAll() {
        this.bot.pathfinder.stop();
        this.bot.pvp.stop();
        this.isBuilding = false;
        logMessage(`${this.name} остановил все действия`);
    }
    
    comeHere(username) {
        const player = this.bot.players[username];
        if (player && player.entity) {
            this.bot.pathfinder.goto(player.entity.position);
            logMessage(`${this.name} идёт к ${username}`);
        }
    }
    
    giveResource(username) {
        const items = this.bot.inventory.items();
        if (items.length > 0) {
            const item = items[0];
            this.bot.toss(item.type, null, 1);
            logMessage(`${this.name} дал ${username} ${item.name}`);
        }
    }
    
    showStatus() {
        const pos = this.bot.entity.position;
        const status = `Bot ${this.name} | HP: ${this.bot.health} | Еда: ${this.bot.food} | Нужда: ${this.currentNeed || 'Нет'} | Позиция: ${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}`;
        logMessage(status);
        this.bot.chat(status);
    }
    
    helpOtherBot(username) {
        const player = this.bot.players[username];
        if (player && player.entity) {
            this.bot.pathfinder.goto(player.entity.position);
            logMessage(`${this.name} помогает ${username}`);
        }
    }
    
    stop() {
        this.isRunning = false;
        this.connected = false;
        if (this.needTimer) {
            clearInterval(this.needTimer);
        }
        if (this.bot) {
            this.bot.end();
        }
    }
}

// Создание и запуск ботов
const bots = [];
const botNames = ['Bot_1', 'Bot_2', 'Bot_3', 'Bot_4', 'Bot_5'];

for (let i = 0; i < 5; i++) {
    const bot = new BotPlayer(botNames[i], i);
    bots.push(bot);
}

// Обработка завершения программы
process.on('SIGINT', () => {
    logMessage('Завершение программы...');
    bots.forEach(bot => bot.stop());
    process.exit(0);
});

logMessage('Все боты запущены!');
logMessage('Ожидание подключения к серверу localhost:53305');

console.log('Боты запущены. Для остановки нажмите Ctrl+C');
console.log('Имена ботов: Bot_1, Bot_2, Bot_3, Bot_4, Bot_5');
console.log('Команды принимаются от LTTBoomza в чате');
