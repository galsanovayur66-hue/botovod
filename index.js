const mineflayer = require('mineflayer');
const fs = require('fs');

// ==================== НАСТРОЙКИ ====================
const PASSWORD = '123123qew';
const NICKS_FILE = './nicks.txt';
const BOT_COUNT = 10;
const MAX_RETRIES = 3;

const SERVER = {
    host: 'mc.mineblaze.net',
    port: 25565,
    version: '1.16.5'
};

// Убираем спам чанков
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = function (chunk, encoding, callback) {
    if (chunk.toString().includes('Ignoring block entities as chunk failed to load')) return true;
    return originalStderrWrite(chunk, encoding, callback);
};

// ==================== ГЕНЕРАТОР НИКОВ ====================
function randomNick() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let nick = '';
    for (let i = 0; i < 8; i++) nick += chars[Math.floor(Math.random() * chars.length)];
    return nick;
}

function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function saveNick(nickname) {
    try { 
        const data = fs.readFileSync(NICKS_FILE, 'utf8');
        if (!data.includes(nickname)) {
            fs.appendFileSync(NICKS_FILE, nickname + '\r\n');
        }
    } catch (e) {
        fs.appendFileSync(NICKS_FILE, nickname + '\r\n');
    }
}

// ==================== БОТ ====================
function createBot(nickname, index, retryCount = 0) {
    console.log(`[${nickname}] (#${index}) Подключение... (попытка ${retryCount + 1})`);

    let authDone = false;
    let nickSaved = false;
    let loginAttempts = 0;
    const MAX_LOGIN_ATTEMPTS = 3;
    
    // Запоминаем ID ссылки, чтобы не спамить
    let processedLinkId = null;

    const bot = mineflayer.createBot({
        host: SERVER.host,
        port: SERVER.port,
        username: nickname,
        version: SERVER.version,
        checkTimeoutInterval: 120000,
        closeTimeout: 120000
    });

    bot.on('error', (err) => {
        if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
            console.log(`[${nickname}] 🔄 ${err.code} - переподключение...`);
            if (retryCount < MAX_RETRIES && !authDone) {
                setTimeout(() => {
                    createBot(nickname, index, retryCount + 1);
                }, 5000);
                bot.end();
            } else {
                console.log(`[${nickname}] ❌ Превышено число попыток`);
            }
        } else {
            console.log(`[${nickname}] ❌ Ошибка: ${err.message}`);
        }
    });

    bot.once('spawn', () => {
        console.log(`[${nickname}] 🎮 Появление на сервере`);

        // Первая попытка регистрации/логина через 3 секунды
        setTimeout(() => {
            if (!authDone && loginAttempts < MAX_LOGIN_ATTEMPTS) {
                bot.chat(`/login ${PASSWORD}`);
                loginAttempts++;
                console.log(`[${nickname}] 🔑 /login (попытка ${loginAttempts})`);
            }
        }, 3000);
        
        setTimeout(() => {
            if (!authDone && loginAttempts < MAX_LOGIN_ATTEMPTS) {
                bot.chat(`/reg ${PASSWORD} ${PASSWORD}`);
                loginAttempts++;
                console.log(`[${nickname}] 🔑 /reg (попытка ${loginAttempts})`);
            }
        }, 6000);
        
        setTimeout(() => {
            if (authDone) {
                bot.chat('/bedwars');
                console.log(`[${nickname}] 🎯 /bedwars`);
            }
        }, 10000);

        if (!nickSaved) {
            nickSaved = true;
            console.log(`[${nickname}] 🏰 На сервере!`);
            saveNick(nickname);
        }
    });

    bot.on('message', (jsonMsg) => {
        const text = jsonMsg.toString();
        const lower = text.toLowerCase();
        const cleanText = text.replace(/§[0-9a-fk-or]/g, '');

        // === ОБРАБОТКА ССЫЛОК (антиспам) ===
        if (cleanText.includes('https://mineblaze.net/antibot/?id=')) {
            const urlMatch = cleanText.match(/https:\/\/mineblaze\.net\/antibot\/\?id=[^\s]+/);
            if (urlMatch) {
                const linkId = urlMatch[0];
                if (processedLinkId === linkId) {
                    return;
                }
                processedLinkId = linkId;
                console.log(`[${nickname}] 🔗 ССЫЛКА: ${linkId}`);
                console.log(`[${nickname}] 📨 ${cleanText}`);
                return;
            }
        }

        // Выводим только уникальные сообщения
        if (cleanText.length > 0 && !cleanText.includes('https://')) {
            console.log(`[${nickname}] 📨 ${cleanText}`);
        }

        // === АВТОРИЗАЦИЯ (реагируем на сообщения из чата) ===
        if (!authDone) {
            // Если сервер просит зарегистрироваться
            if (lower.includes('зарегистрируйтесь') || 
                lower.includes('зарегистрироваться') ||
                lower.includes('регистрация') ||
                lower.includes('register') ||
                (lower.includes('/reg') && lower.includes('пароль'))) {
                console.log(`[${nickname}] 📝 Сервер просит регистрацию, отправляем /reg`);
                bot.chat(`/reg ${PASSWORD} ${PASSWORD}`);
                loginAttempts++;
                return;
            }
            
            // Если сервер просит авторизоваться (логин)
            if (lower.includes('авторизоваться') || 
                lower.includes('войти') ||
                lower.includes('login') ||
                lower.includes('/login')) {
                console.log(`[${nickname}] 🔑 Сервер просит логин, отправляем /login`);
                bot.chat(`/login ${PASSWORD}`);
                loginAttempts++;
                return;
            }
            
            // Успешная авторизация
            if (lower.includes('успешно') || 
                lower.includes('successfully') || 
                lower.includes('зарегистрирован') ||
                lower.includes('registered') ||
                lower.includes('пароль')) {
                authDone = true;
                console.log(`[${nickname}] ✅ Авторизация пройдена!`);
                setTimeout(() => {
                    bot.chat('/bedwars');
                    console.log(`[${nickname}] 🎯 /bedwars`);
                }, 2000);
            }
            
            // Ошибка (ник занят или пароль неверный)
            if (lower.includes('неверно') || 
                lower.includes('wrong') || 
                lower.includes('занят') ||
                lower.includes('already')) {
                console.log(`[${nickname}] ❌ Ник занят или пароль неверный`);
                setTimeout(() => bot.end(), 1000);
            }
        }

        // === ПРИГЛАШЕНИЯ В ПАТИ ===
        if (authDone && (
            lower.includes('пригласил') || 
            lower.includes('приглашение') ||
            lower.includes('party invite') || 
            lower.includes('has invited')
        )) {
            setTimeout(() => {
                bot.chat('/party accept');
                console.log(`[${nickname}] 🤝 Принял приглашение`);
            }, randomDelay(300, 1000));
        }
    });

    bot.on('kicked', (reason) => {
        const cleanReason = reason.toString().replace(/§[0-9a-fk-or]/g, '');
        console.log(`[${nickname}] 🚪 Кик: ${cleanReason.substring(0, 150)}`);
        
        if (cleanReason.toLowerCase().includes('wrong') || 
            cleanReason.toLowerCase().includes('неверн')) {
            console.log(`[${nickname}] ❌ Неверный пароль, отключаемся`);
        }
    });

    bot.on('end', () => {
        console.log(`[${nickname}] 🔌 Отключён`);
    });

    // Таймаут авторизации (если ничего не помогло)
    setTimeout(() => {
        if (!authDone) {
            console.log(`[${nickname}] ⏰ Таймаут авторизации`);
            if (loginAttempts < MAX_LOGIN_ATTEMPTS) {
                bot.chat(`/login ${PASSWORD}`);
                loginAttempts++;
                console.log(`[${nickname}] 🔑 Повторный /login (попытка ${loginAttempts})`);
            }
        }
    }, 35000);

    return bot;
}

// ==================== ЗАПУСК ====================
console.log('🚀 Запуск ботов...\n');

try { fs.writeFileSync(NICKS_FILE, ''); } catch (e) {}

console.log('📋 Список всех ников:');
const allNicks = [];
for (let i = 0; i < BOT_COUNT; i++) {
    const nick = randomNick();
    allNicks.push(nick);
    console.log(`   ${i+1}. ${nick}`);
}
console.log('');

const activeBots = [];
for (let i = 0; i < BOT_COUNT; i++) {
    const nick = allNicks[i];
    const delay = i === 0 ? 0 : randomDelay(3000, 10000);
    setTimeout(() => {
        const bot = createBot(nick, i + 1);
        if (bot) activeBots.push(bot);
    }, delay);
}

console.log('✅ Скрипт запущен. Ожидайте подключения...\n');

console.log('💡 Введите "nicks" в консоли, чтобы показать список ников');
console.log('💡 Введите "stats" для статистики\n');

// Слушаем ввод из консоли
process.stdin.on('data', (data) => {
    const input = data.toString().trim().toLowerCase();
    
    if (input === 'nicks') {
        console.log('\n📋 Список всех ников:');
        allNicks.forEach((nick, i) => {
            console.log(`   ${i+1}. ${nick}`);
        });
        console.log('');
    }
    
    if (input === 'stats') {
        console.log(`\n📊 Активных ботов: ${activeBots.length}`);
        console.log(`📊 Всего ботов: ${BOT_COUNT}\n`);
    }
});

// Статистика каждые 30 секунд
setInterval(() => {
    console.log(`\n📊 Активных ботов: ${activeBots.length}`);
}, 30000);

process.on('SIGINT', () => {
    console.log('\n🛑 Остановка...');
    activeBots.forEach(bot => {
        if (bot && bot.end) bot.end();
    });
    process.exit(0);
});
