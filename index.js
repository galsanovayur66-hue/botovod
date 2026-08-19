const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const Movements = require('mineflayer-pathfinder').Movements;
const pvp = require('mineflayer-pvp').plugin;
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
    constructor(name) {
        this.name = name;
        this.bot = null;
        this.connected = false;
        this.isRunning = true;
        this.currentNeed = null;
        this.needTimer = null;
        this.target = null;
        this.isBuilding = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectTimeout = null;
        this.isReconnecting = false;
        
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
        this.craftingProgress = 0;
        
        this.initBot();
        this.startNeedCycle();
    }
    
    initBot() {
        if (this.bot) {
            try {
                this.bot.end();
            } catch (e) {}
        }
        
        this.bot = mineflayer.createBot({
            host: '195.58.152.25',
            port: 25928,
            username: this.name,
            version: '1.20.1'
        });
        
        this.bot.loadPlugin(pathfinder);
        this.bot.loadPlugin(pvp);
        
        this.bot.on('login', () => {
            this.connected = true;
            this.reconnectAttempts = 0;
            this.isReconnecting = false;
            logMessage(`${this.name} подключился к серверу!`);
            this.setupPathfinder();
            this.bot.chat(`Привет! Я бот ${this.name}`);
            this.bot.chat(`Мой характер: агрессивность ${this.personality.aggressiveness}, трусость ${this.personality.cowardice}`);
        });
        
        this.bot.on('error', (err) => {
            logMessage(`${this.name} ошибка: ${err.message}`);
            if (this.connected) {
                this.connected = false;
                this.scheduleReconnect();
            }
        });
        
        this.bot.on('end', () => {
            logMessage(`${this.name} отключился`);
            this.connected = false;
            this.scheduleReconnect();
        });
        
        this.bot.on('chat', (username, message) => {
            if (username === 'LTTBoomza') {
                this.handleCommand(message, username);
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
            this.bot.chat('Я готов к работе!');
        });
    }
    
    scheduleReconnect() {
        if (this.isReconnecting || !this.isRunning) return;
        
        this.reconnectAttempts++;
        if (this.reconnectAttempts > this.maxReconnectAttempts) {
            logMessage(`${this.name} превысил лимит попыток переподключения (${this.maxReconnectAttempts}). Ожидание 60 секунд...`);
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
            }
            this.reconnectTimeout = setTimeout(() => {
                this.reconnectAttempts = 0;
                this.isReconnecting = false;
                this.scheduleReconnect();
            }, 60000);
            return;
        }
        
        const delay = Math.min(5000 * this.reconnectAttempts, 30000);
        logMessage(`${this.name} переподключение через ${delay/1000}с (попытка ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        this.isReconnecting = true;
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        this.reconnectTimeout = setTimeout(() => {
            this.isReconnecting = false;
            if (this.isRunning && !this.connected) {
                logMessage(`${this.name} попытка переподключения...`);
                this.initBot();
            }
        }, delay);
    }
    
    setupPathfinder() {
        try {
            const mcData = require('minecraft-data')(this.bot.version);
            const defaultMove = new Movements(this.bot, mcData);
            this.bot.pathfinder.setMovements(defaultMove);
        } catch (err) {
            logMessage(`${this.name} ошибка настройки pathfinder: ${err.message}`);
        }
    }
    
    startNeedCycle() {
        if (this.needTimer) {
            clearInterval(this.needTimer);
        }
        this.needTimer = setInterval(() => {
            if (this.connected && this.bot) {
                this.updateNeed();
            }
        }, Math.floor(Math.random() * 5 + 5) * 60000);
    }
    
    updateNeed() {
        this.currentNeed = this.needs[Math.floor(Math.random() * this.needs.length)];
        logMessage(`${this.name} нуждается в: ${this.currentNeed}`);
        this.actOnNeed();
    }
    
    actOnNeed() {
        if (!this.bot || !this.connected) return;
        
        try {
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
        } catch (err) {
            logMessage(`${this.name} ошибка в actOnNeed: ${err.message}`);
        }
    }
    
    handleCommand(message, username) {
        const lowerMsg = message.toLowerCase();
        this.executeCommand(lowerMsg, username);
    }
    
    executeCommand(command, username) {
        if (!this.connected || !this.bot) return;
        
        logMessage(`${this.name} получил команду: ${command} от ${username}`);
        
        let translatedCommand = command;
        for (const [key, value] of Object.entries(commandTranslator)) {
            if (command.includes(key)) {
                translatedCommand = value;
                break;
            }
        }
        
        try {
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
        } catch (err) {
            logMessage(`${this.name} ошибка выполнения команды: ${err.message}`);
        }
    }
    
    async mineResource() {
        if (!this.connected || !this.bot) return;
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
                this.bot.chat(`Добыл ресурс!`);
            } else {
                this.bot.chat('Рядом нет ресурсов');
            }
        } catch (err) {
            logMessage(`${this.name} ошибка при добыче: ${err.message}`);
        }
    }
    
    async craftItem() {
        if (!this.connected || !this.bot) return;
        try {
            const hasWood = this.bot.inventory.items().some(item => item.name === 'oak_planks' || item.name === 'wood');
            
            if (!hasWood) {
                const tree = this.bot.findBlock({
                    matching: ['oak_log', 'birch_log', 'spruce_log'],
                    maxDistance: 10
                });
                if (tree) {
                    await this.bot.pathfinder.goto(tree.position);
                    await this.bot.dig(tree);
                    this.bot.chat('Добыл дерево для крафта');
                }
            }
            
            this.bot.chat('Крафт выполнен!');
            logMessage(`${this.name} выполнил крафт`);
        } catch (err) {
            logMessage(`${this.name} ошибка крафта: ${err.message}`);
        }
    }
    
    async buildHouse() {
        if (!this.connected || !this.bot || this.isBuilding) return;
        this.isBuilding = true;
        
        try {
            const pos = this.bot.entity.position;
            const startX = Math.floor(pos.x) + 2;
            const startZ = Math.floor(pos.z) + 2;
            const height = 3;
            
            logMessage(`${this.name} строит дом на ${startX}, ${Math.floor(pos.y)}, ${startZ}`);
            this.bot.chat('Начинаю строить дом!');
            
            const hasPlanks = this.bot.inventory.items().some(item => item.name === 'oak_planks');
            if (!hasPlanks) {
                this.bot.chat('У меня нет досок для строительства!');
                this.isBuilding = false;
                return;
            }
            
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
                            if (this.bot.canSeeBlock(target)) {
                                await this.bot.placeBlock(target, 'oak_planks');
                            }
                        }
                    }
                }
            }
            
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
            this.bot.chat('Ошибка при строительстве дома');
        }
        
        this.isBuilding = false;
    }
    
    async buildFort() {
        if (!this.connected || !this.bot || this.isBuilding) return;
        this.isBuilding = true;
        
        try {
            const pos = this.bot.entity.position;
            const startX = Math.floor(pos.x) + 2;
            const startZ = Math.floor(pos.z) + 2;
            
            logMessage(`${this.name} строит форт на ${startX}, ${Math.floor(pos.y)}, ${startZ}`);
            this.bot.chat('Начинаю строить форт!');
            
            const hasCobblestone = this.bot.inventory.items().some(item => item.name === 'cobblestone');
            if (!hasCobblestone) {
                this.bot.chat('У меня нет булыжника для форта!');
                this.isBuilding = false;
                return;
            }
            
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
                            if (this.bot.canSeeBlock(target)) {
                                await this.bot.placeBlock(target, 'cobblestone');
                            }
                        }
                    }
                }
            }
            
            this.bot.chat('Форт построен!');
            logMessage(`${this.name} построил форт`);
        } catch (err) {
            logMessage(`${this.name} ошибка при строительстве форта: ${err.message}`);
            this.bot.chat('Ошибка при строительстве форта');
        }
        
        this.isBuilding = false;
    }
    
    async mineShaft() {
        if (!this.connected || !this.bot) return;
        try {
            const pos = this.bot.entity.position;
            const startX = Math.floor(pos.x);
            const startZ = Math.floor(pos.z);
            
            this.bot.chat('Копаю шахту!');
            
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
        if (!this.connected || !this.bot) return;
        const player = this.bot.players[username];
        if (player && player.entity) {
            this.target = player.entity;
            this.attackTarget();
        }
    }
    
    attackTarget() {
        if (!this.target || !this.bot || !this.connected) return;
        
        try {
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
        } catch (err) {
            logMessage(`${this.name} ошибка атаки: ${err.message}`);
        }
    }
    
    handleAttacked(entity) {
        if (entity && entity.username !== this.name && this.bot && this.bot.health > 5) {
            this.target = entity;
            this.attackTarget();
            logMessage(`${this.name} атакует обидчика ${entity.username}`);
            this.bot.chat(`Атакую ${entity.username}!`);
        }
    }
    
    handleLTTBoomzaAttacked(entity) {
        if (entity && entity.username === 'LTTBoomza') {
            logMessage(`${this.name} спешит на помощь LTTBoomza!`);
            this.target = entity;
            this.attackTarget();
            this.bot.chat('LTTBoomza в опасности! Я спешу на помощь!');
        }
    }
    
    handleHealth() {
        if (!this.bot || !this.connected) return;
        try {
            if (this.bot.health < 5 && this.shelterPosition) {
                this.bot.pathfinder.goto(this.shelterPosition);
                logMessage(`${this.name} прячется в убежище (HP: ${this.bot.health})`);
                this.bot.chat('Я ранен, прячусь!');
            }
            
            if (this.bot.food < 3) {
                this.findFood();
            }
        } catch (err) {
            // Игнорируем ошибки
        }
    }
    
    handleTime() {
        if (!this.bot || !this.connected) return;
        try {
            if (this.bot.time.timeOfDay > 13000 && this.bot.time.timeOfDay < 24000) {
                if (this.bot.health < 10) {
                    this.buildShelter();
                }
            }
        } catch (err) {
            // Игнорируем ошибки
        }
    }
    
    async findFood() {
        if (!this.connected || !this.bot) return;
        try {
            const animals = this.bot.entities.filter(e => 
                e.type === 'mob' && ['cow', 'pig', 'chicken', 'sheep'].includes(e.name)
            );
            
            if (animals.length > 0) {
                const target = animals[0];
                await this.bot.pathfinder.goto(target.position);
                this.bot.attack(target);
                logMessage(`${this.name} охотится на ${target.name}`);
                this.bot.chat(`Охочусь на ${target.name}!`);
            } else {
                const mushrooms = this.bot.findBlocks({
                    matching: ['brown_mushroom', 'red_mushroom'],
                    maxDistance: 20,
                    count: 5
                });
                
                if (mushrooms.length > 0) {
                    await this.bot.pathfinder.goto(mushrooms[0]);
                    await this.bot.dig(mushrooms[0]);
                    this.bot.chat('Собрал грибы!');
                }
            }
        } catch (err) {
            logMessage(`${this.name} ошибка при поиске еды: ${err.message}`);
        }
    }
    
    async goToBed() {
        if (!this.connected || !this.bot) return;
        try {
            const bed = this.bot.findBlock({
                matching: ['bed'],
                maxDistance: 16
            });
            
            if (bed) {
                await this.bot.pathfinder.goto(bed.position);
                await this.bot.sleep(bed);
                logMessage(`${this.name} лёг спать`);
                this.bot.chat('Спокойной ночи!');
            }
        } catch (err) {
            logMessage(`${this.name} ошибка при сне: ${err.message}`);
        }
    }
    
    async buildShelter() {
        if (!this.connected || !this.bot) return;
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
            this.bot.chat('Построил убежище!');
        } catch (err) {
            logMessage(`${this.name} ошибка при строительстве убежища: ${err.message}`);
        }
    }
    
    async buildStructure(command) {
        if (!this.connected || !this.bot) return;
        if (command.includes('башня')) {
            await this.buildTower();
        }
    }
    
    async buildTower() {
        if (!this.connected || !this.bot) return;
        try {
            const pos = this.bot.entity.position;
            const startX = Math.floor(pos.x);
            const startZ = Math.floor(pos.z);
            
            this.bot.chat('Строю башню!');
            
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
                            if (this.bot.canSeeBlock(target)) {
                                await this.bot.placeBlock(target, 'cobblestone');
                            }
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
        if (!this.connected || !this.bot) return;
        const randomX = Math.floor(Math.random() * 50) - 25;
        const randomZ = Math.floor(Math.random() * 50) - 25;
        const pos = this.bot.entity.position;
        
        this.bot.pathfinder.goto({
            x: Math.floor(pos.x) + randomX,
            y: Math.floor(pos.y),
            z: Math.floor(pos.z) + randomZ
        });
        
        logMessage(`${this.name} исследует область`);
        this.bot.chat('Исследую окрестности!');
    }
    
    rest() {
        logMessage(`${this.name} отдыхает`);
        this.bot.chat('Отдыхаю...');
    }
    
    stopAll() {
        if (!this.bot) return;
        try {
            this.bot.pathfinder.stop();
            this.bot.pvp.stop();
            this.isBuilding = false;
            logMessage(`${this.name} остановил все действия`);
            this.bot.chat('Остановил все действия!');
        } catch (err) {
            // Игнорируем ошибки
        }
    }
    
    comeHere(username) {
        if (!this.connected || !this.bot) return;
        const player = this.bot.players[username];
        if (player && player.entity) {
            this.bot.pathfinder.goto(player.entity.position);
            logMessage(`${this.name} идёт к ${username}`);
            this.bot.chat(`Иду к ${username}!`);
        }
    }
    
    giveResource(username) {
        if (!this.connected || !this.bot) return;
        try {
            const items = this.bot.inventory.items();
            if (items.length > 0) {
                const item = items[0];
                this.bot.toss(item.type, null, 1);
                logMessage(`${this.name} дал ${username} ${item.name}`);
                this.bot.chat(`Дал ${username} ${item.name}`);
            } else {
                this.bot.chat('У меня нет предметов!');
            }
        } catch (err) {
            logMessage(`${this.name} ошибка при передаче ресурса: ${err.message}`);
        }
    }
    
    showStatus() {
        if (!this.connected || !this.bot) return;
        try {
            const pos = this.bot.entity.position;
            const status = `Bot ${this.name} | HP: ${this.bot.health} | Еда: ${this.bot.food} | Нужда: ${this.currentNeed || 'Нет'} | Позиция: ${Math.floor(pos.x)}, ${Math.floor(pos.y)}, ${Math.floor(pos.z)}`;
            logMessage(status);
            this.bot.chat(status);
        } catch (err) {
            logMessage(`${this.name} ошибка статуса: ${err.message}`);
        }
    }
    
    stop() {
        this.isRunning = false;
        this.connected = false;
        if (this.needTimer) {
            clearInterval(this.needTimer);
            this.needTimer = null;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.bot) {
            try {
                this.bot.end();
            } catch (e) {}
            this.bot = null;
        }
    }
}

// Создание и запуск ОДНОГО бота
const bot = new BotPlayer('Bot_1');

// Обработка завершения программы
process.on('SIGINT', () => {
    logMessage('Завершение программы...');
    bot.stop();
    process.exit(0);
});

// Обработка ошибок на уровне процесса
process.on('uncaughtException', (err) => {
    logMessage(`Необработанная ошибка: ${err.message}`);
});

logMessage('Бот запущен!');
logMessage('Ожидание подключения к серверу 195.58.152.25:25928');

console.log('Бот запущен! Имя: Bot_1');
console.log('Команды принимаются от LTTBoomza в чате');
console.log('Для остановки нажмите Ctrl+C');
