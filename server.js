/**
 * Голубь Мессенджер — Сервер v5.0
 * + Бот @dirtyexpress
 * + Бот @karnizcal (калькулятор карнизов)
 * + Онлайн/офлайн статус в личных чатах
 * + Переименование группы / аватарка группы
 * + Администраторы группы
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'golub.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password TEXT NOT NULL,
    avatar_color TEXT DEFAULT '#6C3AE8',
    avatar_data TEXT,
    is_bot INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
    last_seen INTEGER DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT,
    avatar_data TEXT,
    created_by TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE TABLE IF NOT EXISTS chat_members (
    chat_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    PRIMARY KEY(chat_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    from_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'text',
    text TEXT,
    media_data TEXT,
    media_name TEXT,
    media_size INTEGER,
    media_duration INTEGER,
    reply_to TEXT,
    edited INTEGER DEFAULT 0,
    deleted INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
  );
  CREATE INDEX IF NOT EXISTS idx_msg_chat ON messages(chat_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_cm_user ON chat_members(user_id);
`);

// Migrations
try { db.exec(`ALTER TABLE users ADD COLUMN avatar_data TEXT`); } catch(e) {}
try { db.exec(`ALTER TABLE users ADD COLUMN is_bot INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE chat_members ADD COLUMN is_admin INTEGER DEFAULT 0`); } catch(e) {}
try { db.exec(`ALTER TABLE chats ADD COLUMN avatar_data TEXT`); } catch(e) {}

// ─── BOT: @dirtyexpress ─────────────────────────────────────────────────────
const BOT1_ID = 'bot-dirtyexpress-0000-0000-000000000000';
const BOT1_USERNAME = 'dirtyexpress';
const BOT1_NAME = 'DirtyExpress Bot';
const BOT1_COLOR = '#FF4D6A';

// ─── BOT: @karnizcal ────────────────────────────────────────────────────────
const BOT2_ID = 'bot-karnizcal-00000-0000-000000000000';
const BOT2_USERNAME = 'karnizcal';
const BOT2_NAME = 'КарнизКал 📐';
const BOT2_COLOR = '#3A8EE8';

function ensureBot(id, username, name, color) {
  const existing = db.prepare('SELECT id FROM users WHERE id=?').get(id);
  if (!existing) {
    db.prepare('INSERT OR IGNORE INTO users(id,name,username,password,avatar_color,is_bot) VALUES(?,?,?,?,?,1)')
      .run(id, name, username, bcrypt.hashSync(uuid(), 10), color);
  }
}
ensureBot(BOT1_ID, BOT1_USERNAME, BOT1_NAME, BOT1_COLOR);
ensureBot(BOT2_ID, BOT2_USERNAME, BOT2_NAME, BOT2_COLOR);

// ─── BOT1 COMMANDS (@dirtyexpress) ──────────────────────────────────────────
const BOT1_COMMANDS = {
  '/start': () => `👋 Привет! Я **DirtyExpress Bot** 🤖\n\nДоступные команды:\n/help — список команд\n/time — текущее время\n/joke — случайная шутка\n/flip — орёл или решка\n/dice — бросить кубик\n/about — о мессенджере`,
  '/help': () => `📋 **Мои команды:**\n\n/start — приветствие\n/time — текущее время\n/joke — случайная шутка\n/flip — орёл или решка\n/dice — бросить кубик\n/about — о мессенджере`,
  '/time': () => `🕐 Сейчас: **${new Date().toLocaleString('ru-RU', {timeZone:'Europe/Moscow'})}** (МСК)`,
  '/joke': () => {
    const jokes = [
      'Программист зашёл в магазин. Купил литр молока. Увидел 2 — взял оба. 😄',
      'Почему программисты путают Хэллоуин и Рождество? Потому что Oct 31 = Dec 25! 🎃',
      '— Сынок, иди есть! — Подожди, я доделаю код. — Ладно, иду... 12 лет спустя.',
      'Есть только 10 типов людей: те, кто понимает двоичный код, и те, кто нет.',
      'Git blame — это когда все виноваты, кроме тебя. 😅',
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  },
  '/flip': () => Math.random() > 0.5 ? '🪙 **Орёл!**' : '🪙 **Решка!**',
  '/dice': () => `🎲 Выпало: **${Math.floor(Math.random() * 6) + 1}**`,
  '/about': () => `🕊️ **Голубь Мессенджер v5.0**\n\n✅ Личные и групповые чаты\n✅ Голосовые и видеосообщения\n✅ Файлы и фото\n✅ Редактирование сообщений\n✅ Администраторы групп\n✅ Аватарки и названия групп\n✅ Встроенные боты`,
};

function processBot1(text) {
  if (!text?.startsWith('/')) return null;
  const cmd = text.trim().split(' ')[0].toLowerCase();
  const handler = BOT1_COMMANDS[cmd];
  if (!handler) return `❓ Неизвестная команда. Напиши /help`;
  return handler();
}

// ─── BOT2 (@karnizcal) — Калькулятор карнизов ───────────────────────────────
const OFFSET_STRAIGHT_CENTER = 15.2;
const OFFSET_STRAIGHT_LTR = 11.6;
const OFFSET_L_A = 21.15;
const OFFSET_L_B = 17.45;
const MAX_SECTION_LEN = 310.0;

function parseCm(text) {
  const s = text.trim().replace(/\s/g,'').replace(',','.');
  const n = parseFloat(s);
  if (isNaN(n) || n <= 0) throw new Error('bad');
  return n;
}
function evenUp(n) { return n % 2 === 0 ? n : n + 1; }
function splitSections(total) {
  if (total <= 0) return [0];
  const n = Math.max(1, Math.ceil(total / MAX_SECTION_LEN));
  return Array(n).fill(total / n);
}
function fmtPieces(arr, dec=1) {
  return arr.map(v => v.toFixed(dec)).join(' + ');
}
function calcStraight(x, mode) {
  const offset = mode === 'center' ? OFFSET_STRAIGHT_CENTER : OFFSET_STRAIGHT_LTR;
  const xEff = Math.max(0, x - offset);
  const pieces = splitSections(xEff);
  const runners = evenUp(Math.ceil(x / 8));
  return { xEff, pieces, runners, hooks: runners + 10, mounts: Math.ceil(x / 100) + 1 };
}
function calcL(x, y, mode) {
  const [xOff, yOff] = mode === 'rtl' ? [OFFSET_L_B, OFFSET_L_A] : [OFFSET_L_A, OFFSET_L_B];
  const xEff = Math.max(0, x - xOff);
  const yEff = Math.max(0, y - yOff);
  const runners = evenUp(Math.ceil((x + y) / 8));
  return {
    xEff, yEff,
    piecesX: splitSections(xEff),
    piecesY: splitSections(yEff),
    runners,
    hooks: runners + 10,
    mounts: Math.ceil(x/100) + Math.ceil(y/100) + 2
  };
}

// Состояния диалога с botom 2
const b2State = new Map(); // userId -> state object

function processBot2(text, userId) {
  const state = b2State.get(userId) || { step: 'menu' };
  text = (text || '').trim();

  if (text === '/start' || text === '/new' || text === '/menu') {
    b2State.set(userId, { step: 'menu' });
    return `📐 **КарнизКал** — Калькулятор карнизов\n\nВыберите тип:\n\n▶️ Напишите **1** — Прямые карнизы\n▶️ Напишите **2** — Г-образные карнизы\n\n/help — помощь`;
  }
  if (text === '/help') {
    return `📐 **КарнизКал** — Помощь\n\n**Команды:**\n/start или /menu — главное меню\n/new — начать заново\n\n**Как пользоваться:**\n1. Напишите **1** (прямой) или **2** (Г-образный)\n2. Выберите режим (1/2/3)\n3. Введите размеры в сантиметрах\n\n📏 Размеры вводите числом, например: **510** или **510,5**`;
  }

  const step = state.step;

  if (step === 'menu') {
    if (text === '1') {
      b2State.set(userId, { step: 'straight_mode' });
      return `📏 **Прямые карнизы**\n\nВыберите режим:\n▶️ **1** — К центру\n▶️ **2** — Слева-Направо\n\n/menu — назад`;
    }
    if (text === '2') {
      b2State.set(userId, { step: 'l_mode' });
      return `📐 **Г-образные карнизы**\n\nВыберите режим:\n▶️ **1** — К центру\n▶️ **2** — Слева-Направо\n▶️ **3** — Справа-Налево\n\n/menu — назад`;
    }
    return `📐 **КарнизКал**\n\nНапишите:\n▶️ **1** — Прямые карнизы\n▶️ **2** — Г-образные карнизы\n\n/help — помощь`;
  }

  if (step === 'straight_mode') {
    const modes = { '1': 'center', '2': 'ltr' };
    const modeNames = { 'center': 'К центру', 'ltr': 'Слева-Направо' };
    if (!modes[text]) return `Выберите режим:\n▶️ **1** — К центру\n▶️ **2** — Слева-Направо\n\n/menu — назад`;
    b2State.set(userId, { step: 'straight_len', mode: modes[text], modeName: modeNames[modes[text]] });
    return `📏 Режим: **${modeNames[modes[text]]}**\n\nВведите длину карниза X (см):\n_Например: 510_`;
  }

  if (step === 'straight_len') {
    try {
      const x = parseCm(text);
      const r = calcStraight(x, state.mode);
      b2State.set(userId, { step: 'menu' });
      return `✅ **Прямой карниз**\nРежим: **${state.modeName}**\nДлина X: **${x.toFixed(0)} см**\n\nПосле вычета: **${r.xEff.toFixed(1)} см**\nСекции: **${fmtPieces(r.pieces)} см**\n\nБегунков: **${r.runners} шт.**\nКрючки: **${r.hooks} шт.**\nКреплений: **${r.mounts} шт.**\n\n/new — новый расчёт`;
    } catch(e) {
      return `❌ Не понял размер. Введите число в сантиметрах, например: **510**`;
    }
  }

  if (step === 'l_mode') {
    const modes = { '1': 'center', '2': 'ltr', '3': 'rtl' };
    const modeNames = { 'center': 'К центру', 'ltr': 'Слева-Направо', 'rtl': 'Справа-Налево' };
    if (!modes[text]) return `Выберите режим:\n▶️ **1** — К центру\n▶️ **2** — Слева-Направо\n▶️ **3** — Справа-Налево\n\n/menu — назад`;
    b2State.set(userId, { step: 'l_len_x', mode: modes[text], modeName: modeNames[modes[text]] });
    return `📐 Режим: **${modeNames[modes[text]]}**\n\nВведите длину X (см):\n_Например: 640_`;
  }

  if (step === 'l_len_x') {
    try {
      const x = parseCm(text);
      b2State.set(userId, { ...state, step: 'l_len_y', x });
      return `✅ X = **${x.toFixed(0)} см**\n\nТеперь введите длину Y (см):\n_Например: 280_`;
    } catch(e) {
      return `❌ Не понял размер X. Введите число, например: **640**`;
    }
  }

  if (step === 'l_len_y') {
    try {
      const y = parseCm(text);
      const r = calcL(state.x, y, state.mode);
      b2State.set(userId, { step: 'menu' });
      return `✅ **Г-образный карниз**\nРежим: **${state.modeName}**\nX: **${state.x.toFixed(0)} см** → **${r.xEff.toFixed(2)} см**\nY: **${y.toFixed(0)} см** → **${r.yEff.toFixed(2)} см**\n\nСекции X: **${fmtPieces(r.piecesX, 2)} см**\nСекции Y: **${fmtPieces(r.piecesY, 2)} см**\n\nБегунков: **${r.runners} шт.**\nКрючки: **${r.hooks} шт.**\nКреплений: **${r.mounts} шт.**\n\n/new — новый расчёт`;
    } catch(e) {
      return `❌ Не понял размер Y. Введите число, например: **280**`;
    }
  }

  // fallback
  b2State.set(userId, { step: 'menu' });
  return `📐 **КарнизКал**\n\nНапишите **1** (прямой) или **2** (Г-образный)\n\n/help — помощь`;
}

// ─── DB queries ──────────────────────────────────────────────────────────────
const q = {
  createUser:     db.prepare('INSERT INTO users(id,name,username,password,avatar_color) VALUES(?,?,?,?,?)'),
  userByUsername: db.prepare('SELECT * FROM users WHERE username=?'),
  userById:       db.prepare('SELECT id,name,username,avatar_color,avatar_data,last_seen,is_bot FROM users WHERE id=?'),
  searchUsers:    db.prepare("SELECT id,name,username,avatar_color,avatar_data,is_bot FROM users WHERE (username LIKE ? OR name LIKE ?) LIMIT 20"),
  touchUser:      db.prepare('UPDATE users SET last_seen=? WHERE id=?'),
  addSession:     db.prepare('INSERT INTO sessions(token,user_id) VALUES(?,?)'),
  getSession:     db.prepare('SELECT s.token, u.id,u.name,u.username,u.avatar_color,u.avatar_data,u.is_bot FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=?'),
  delSession:     db.prepare('DELETE FROM sessions WHERE token=?'),
  updatePassword: db.prepare('UPDATE users SET password=? WHERE id=?'),
  updateAvatar:   db.prepare('UPDATE users SET avatar_data=? WHERE id=?'),
  createChat:     db.prepare('INSERT INTO chats(id,type,name,created_by) VALUES(?,?,?,?)'),
  chatById:       db.prepare('SELECT * FROM chats WHERE id=?'),
  directChat:     db.prepare(`SELECT c.* FROM chats c JOIN chat_members a ON c.id=a.chat_id AND a.user_id=? JOIN chat_members b ON c.id=b.chat_id AND b.user_id=? WHERE c.type='direct' LIMIT 1`),
  userChats:      db.prepare(`SELECT c.*,(SELECT text FROM messages WHERE chat_id=c.id AND deleted=0 ORDER BY created_at DESC LIMIT 1) as last_text,(SELECT type FROM messages WHERE chat_id=c.id AND deleted=0 ORDER BY created_at DESC LIMIT 1) as last_type,(SELECT created_at FROM messages WHERE chat_id=c.id AND deleted=0 ORDER BY created_at DESC LIMIT 1) as last_at FROM chats c JOIN chat_members cm ON c.id=cm.chat_id WHERE cm.user_id=? ORDER BY COALESCE(last_at,c.created_at) DESC`),
  chatMembers:    db.prepare('SELECT u.id,u.name,u.username,u.avatar_color,u.avatar_data,u.is_bot,cm.is_admin FROM users u JOIN chat_members cm ON u.id=cm.user_id WHERE cm.chat_id=?'),
  addMember:      db.prepare('INSERT OR IGNORE INTO chat_members(chat_id,user_id,is_admin) VALUES(?,?,?)'),
  removeMember:   db.prepare('DELETE FROM chat_members WHERE chat_id=? AND user_id=?'),
  isMember:       db.prepare('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?'),
  isAdmin:        db.prepare('SELECT is_admin FROM chat_members WHERE chat_id=? AND user_id=?'),
  chatMemberIds:  db.prepare('SELECT user_id FROM chat_members WHERE chat_id=?'),
  insertMsg:      db.prepare('INSERT INTO messages(id,chat_id,from_id,type,text,media_data,media_name,media_size,media_duration,reply_to) VALUES(?,?,?,?,?,?,?,?,?,?)'),
  chatMsgs:       db.prepare('SELECT * FROM messages WHERE chat_id=? AND deleted=0 ORDER BY created_at ASC LIMIT 200'),
  getMsg:         db.prepare('SELECT * FROM messages WHERE id=?'),
  editMsg:        db.prepare('UPDATE messages SET text=?,edited=1 WHERE id=? AND from_id=?'),
  delMsg:         db.prepare('UPDATE messages SET deleted=1 WHERE id=? AND from_id=?'),
  updateChatName: db.prepare('UPDATE chats SET name=? WHERE id=?'),
  updateChatAvatar: db.prepare('UPDATE chats SET avatar_data=? WHERE id=?'),
};

const COLORS = ['#6C3AE8','#E83A6C','#3A8EE8','#E8923A','#3AE87A','#9B5DEA','#E83AE0','#3AE8E8'];
const randColor = () => COLORS[Math.floor(Math.random()*COLORS.length)];

const conns = new Map();
function broadcast(payload, userIds) {
  const data = JSON.stringify(payload);
  for (const uid of userIds) {
    const socks = conns.get(uid);
    if (!socks) continue;
    for (const ws of socks) {
      try { if (ws.readyState === 1) ws.send(data); } catch(e) {}
    }
  }
}
function chatMemberIds(chatId) {
  return q.chatMemberIds.all(chatId).map(r => r.user_id);
}
function getAuth(req) {
  const token = (req.headers.authorization||'').replace('Bearer ','').trim();
  if (!token) return null;
  const s = q.getSession.get(token);
  if (!s) return null;
  q.touchUser.run(Date.now(), s.id);
  return { ...s, token };
}
function apiErr(res, code, msg) { res.writeHead(code); res.end(JSON.stringify({ error: msg })); }
function apiOk(res, data) { res.writeHead(200); res.end(JSON.stringify(data)); }

function sendBotMsg(chatId, text, memberIds) {
  const id = uuid(); const now = Date.now();
  q.insertMsg.run(id, chatId, BOT1_ID, 'text', text, null, null, null, null, null);
  const msg = {id,chat_id:chatId,from_id:BOT1_ID,type:'text',text,media_data:null,media_name:null,media_size:null,media_duration:null,reply_to:null,edited:0,deleted:0,created_at:now};
  broadcast({type:'new_message',message:msg}, memberIds);
}
function sendBotMsg2(chatId, text, memberIds, fromUserId) {
  const id = uuid(); const now = Date.now();
  q.insertMsg.run(id, chatId, BOT2_ID, 'text', text, null, null, null, null, null);
  const msg = {id,chat_id:chatId,from_id:BOT2_ID,type:'text',text,media_data:null,media_name:null,media_size:null,media_duration:null,reply_to:null,edited:0,deleted:0,created_at:now};
  broadcast({type:'new_message',message:msg}, memberIds);
}

const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url||'/', 'http://x');
  const pathname = urlObj.pathname;

  if (pathname === '/manifest.json') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({
      name: 'Голубь', short_name: 'Голубь',
      description: 'Голубь Мессенджер',
      start_url: '/', display: 'standalone',
      background_color: '#0D0D14', theme_color: '#5B5EF4',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    }));
    return;
  }

  if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type','application/json');
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS,PATCH');
    if (req.method==='OPTIONS'){res.writeHead(200);res.end();return;}
    let body='';
    req.on('data',d=>{body+=d; if(body.length>20*1024*1024){res.writeHead(413);res.end();}});
    req.on('end',()=>{
      let data={};
      try{if(body)data=JSON.parse(body);}catch(e){}
      handleAPI(req, res, pathname, urlObj, data);
    });
    return;
  }

  const safePath = pathname.replace(/\.\./g,'');
  const fp = path.join(__dirname,'public', safePath==='/'?'index.html':safePath);
  const ext = path.extname(fp);
  const mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.ico':'image/x-icon'}[ext]||'text/plain';
  fs.readFile(fp, (err, d) => {
    if (err) {
      fs.readFile(path.join(__dirname,'public','index.html'), (e2,d2) => {
        if(e2){res.writeHead(404);res.end('Not Found');return;}
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Permissions-Policy':'microphone=*, camera=*','Cache-Control':'no-cache'});
        res.end(d2);
      });
      return;
    }
    res.writeHead(200,{'Content-Type':mime+(mime.includes('text')?'; charset=utf-8':''),'Cache-Control':ext==='.html'?'no-cache':'max-age=3600'});
    res.end(d);
  });
});

function handleAPI(req, res, pathname, urlObj, data) {
  if (pathname==='/api/register' && req.method==='POST') {
    const {name,username,password} = data;
    if (!name?.trim()||!username?.trim()||!password) return apiErr(res,400,'Заполните все поля');
    if (password.length<4) return apiErr(res,400,'Пароль минимум 4 символа');
    if (!/^[a-zA-Z0-9_]{2,30}$/.test(username)) return apiErr(res,400,'Логин: только буквы, цифры и _');
    if (q.userByUsername.get(username)) return apiErr(res,409,'Логин уже занят');
    const hash = bcrypt.hashSync(password, 10);
    const id = uuid(); const color = randColor();
    q.createUser.run(id, name.trim(), username.trim(), hash, color);
    const token = uuid(); q.addSession.run(token, id);
    return apiOk(res,{token, user:{id, name:name.trim(), username:username.trim(), avatar_color:color, avatar_data:null, is_bot:0}});
  }

  if (pathname==='/api/login' && req.method==='POST') {
    const {username,password} = data;
    if (!username||!password) return apiErr(res,400,'Заполните все поля');
    const user = q.userByUsername.get(username);
    if (!user||!bcrypt.compareSync(password,user.password)) return apiErr(res,401,'Неверный логин или пароль');
    const token = uuid(); q.addSession.run(token, user.id);
    return apiOk(res,{token, user:{id:user.id, name:user.name, username:user.username, avatar_color:user.avatar_color, avatar_data:user.avatar_data||null, is_bot:user.is_bot||0}});
  }

  if (pathname==='/api/logout' && req.method==='POST') {
    const me = getAuth(req); if (me) q.delSession.run(me.token);
    return apiOk(res,{ok:true});
  }

  if (pathname==='/api/me' && req.method==='GET') {
    const me = getAuth(req); if (!me) return apiErr(res,401,'Не авторизован');
    return apiOk(res,{user:{id:me.id,name:me.name,username:me.username,avatar_color:me.avatar_color,avatar_data:me.avatar_data||null,is_bot:me.is_bot||0}});
  }

  if (pathname==='/api/me/password' && req.method==='POST') {
    const me = getAuth(req); if (!me) return apiErr(res,401,'Не авторизован');
    const {old_password,new_password} = data;
    if (!old_password||!new_password) return apiErr(res,400,'Заполните все поля');
    if (new_password.length<4) return apiErr(res,400,'Минимум 4 символа');
    const user = q.userByUsername.get(me.username);
    if (!bcrypt.compareSync(old_password,user.password)) return apiErr(res,400,'Неверный текущий пароль');
    q.updatePassword.run(bcrypt.hashSync(new_password,10),me.id);
    return apiOk(res,{ok:true});
  }

  if (pathname==='/api/me/avatar' && req.method==='POST') {
    const me = getAuth(req); if (!me) return apiErr(res,401,'Не авторизован');
    const {avatar_data} = data; if (!avatar_data) return apiErr(res,400,'Нет данных');
    q.updateAvatar.run(avatar_data, me.id);
    const chats = q.userChats.all(me.id);
    const contacts = new Set([me.id]);
    chats.forEach(c => q.chatMemberIds.all(c.id).forEach(r => contacts.add(r.user_id)));
    broadcast({type:'user_avatar',user_id:me.id,avatar_data},[...contacts]);
    return apiOk(res,{ok:true,avatar_data});
  }

  if (pathname==='/api/users/search' && req.method==='GET') {
    const me = getAuth(req); if (!me) return apiErr(res,401,'Не авторизован');
    const pat = '%'+(urlObj.searchParams.get('q')||'')+'%';
    const users = q.searchUsers.all(pat,pat).filter(u=>u.id!==me.id);
    const qStr = (urlObj.searchParams.get('q')||'').toLowerCase();
    // Always include bots in search
    for (const [bid, bun, bname] of [[BOT1_ID,BOT1_USERNAME,BOT1_NAME],[BOT2_ID,BOT2_USERNAME,BOT2_NAME]]) {
      if (!users.some(u=>u.id===bid) && (qStr===''||bun.includes(qStr)||bname.toLowerCase().includes(qStr))) {
        const bu = q.userById.get(bid);
        if (bu) users.unshift({id:bu.id,name:bu.name,username:bu.username,avatar_color:bu.avatar_color,avatar_data:bu.avatar_data,is_bot:1});
      }
    }
    return apiOk(res,{users});
  }

  if (pathname==='/api/chats' && req.method==='GET') {
    const me = getAuth(req); if (!me) return apiErr(res,401,'Не авторизован');
    return apiOk(res,{chats: q.userChats.all(me.id).map(c=>({...c,members:q.chatMembers.all(c.id)}))});
  }

  if (pathname==='/api/chats' && req.method==='POST') {
    const me = getAuth(req); if (!me) return apiErr(res,401,'Не авторизован');
    const {type,members=[],name} = data;
    if (type==='direct') {
      if (!members[0]) return apiErr(res,400,'Нужен участник');
      const otherId = members[0];
      const existing = q.directChat.get(me.id,otherId);
      if (existing) return apiOk(res,{chat:{...existing,members:q.chatMembers.all(existing.id)},messages:q.chatMsgs.all(existing.id)});
      const id = uuid(); q.createChat.run(id,'direct',null,me.id);
      q.addMember.run(id,me.id,0); q.addMember.run(id,otherId,0);
      const chat = {...q.chatById.get(id),members:q.chatMembers.all(id)};
      broadcast({type:'new_chat',chat},[otherId]);
      // Bot welcome
      if (otherId === BOT1_ID) setTimeout(()=>sendBotMsg(id,BOT1_COMMANDS['/start'](),[me.id,BOT1_ID]),500);
      if (otherId === BOT2_ID) {
        b2State.set(me.id, {step:'menu'});
        setTimeout(()=>sendBotMsg2(id,processBot2('/start',me.id),[me.id,BOT2_ID],me.id),500);
      }
      return apiOk(res,{chat,messages:[]});
    }
    if (type==='group') {
      if (!name?.trim()) return apiErr(res,400,'Нужно название');
      const id = uuid(); q.createChat.run(id,'group',name.trim(),me.id);
      q.addMember.run(id,me.id,1);
      members.forEach(uid=>q.addMember.run(id,uid,0));
      const chat = {...q.chatById.get(id),members:q.chatMembers.all(id)};
      broadcast({type:'new_chat',chat},members);
      return apiOk(res,{chat,messages:[]});
    }
    return apiErr(res,400,'Неверный тип');
  }

  // Update group name/avatar
  const chatEditMatch = pathname.match(/^\/api\/chats\/([^/]+)$/);
  if (chatEditMatch && req.method==='PATCH') {
    const chatId = chatEditMatch[1];
    const me = getAuth(req); if (!me) return apiErr(res,401,'Не авторизован');
    const chat = q.chatById.get(chatId);
    if (!chat||chat.type!=='group') return apiErr(res,404,'Группа не найдена');
    const adminRow = q.isAdmin.get(chatId,me.id);
    if (!adminRow||!adminRow.is_admin) return apiErr(res,403,'Только администратор');
    if (data.name !== undefined) {
      if (!data.name?.trim()) return apiErr(res,400,'Название не может быть пустым');
      q.updateChatName.run(data.name.trim(), chatId);
    }
    if (data.avatar_data !== undefined) {
      q.updateChatAvatar.run(data.avatar_data, chatId);
    }
    const updatedChat = {...q.chatById.get(chatId), members: q.chatMembers.all(chatId)};
    broadcast({type:'chat_updated',chat:updatedChat}, chatMemberIds(chatId));
    return apiOk(res,{ok:true, chat:updatedChat});
  }

  // Add member to group
  const addMemberMatch = pathname.match(/^\/api\/chats\/([^/]+)\/members$/);
  if (addMemberMatch && req.method==='POST') {
    const chatId = addMemberMatch[1];
    const me = getAuth(req); if (!me) return apiErr(res,401,'Не авторизован');
    const chat = q.chatById.get(chatId);
    if (!chat||chat.type!=='group') return apiErr(res,404,'Группа не найдена');
    const adminRow = q.isAdmin.get(chatId,me.id);
    if (!adminRow||!adminRow.is_admin) return apiErr(res,403,'Только администратор');
    const {user_id} = data;
    if (!user_id) return apiErr(res,400,'Нужен user_id');
    q.addMember.run(chatId,user_id,0);
    const updatedChat = {...q.chatById.get(chatId),members:q.chatMembers.all(chatId)};
    const memberIds = chatMemberIds(chatId);
    broadcast({type:'chat_updated',chat:updatedChat},memberIds);
    const addedUser = q.userById.get(user_id);
    if (addedUser) sendBotMsg(chatId,`👋 ${addedUser.name} присоединился к группе`,memberIds);
    return apiOk(res,{ok:true,chat:updatedChat});
  }

  // Remove member
  const removeMemberMatch = pathname.match(/^\/api\/chats\/([^/]+)\/members\/([^/]+)$/);
  if (removeMemberMatch && req.method==='DELETE') {
    const chatId = removeMemberMatch[1], targetId = removeMemberMatch[2];
    const me = getAuth(req); if (!me) return apiErr(res,401,'Не авторизован');
    const chat = q.chatById.get(chatId);
    if (!chat||chat.type!=='group') return apiErr(res,404,'Группа не найдена');
    if (me.id !== targetId) {
      const adminRow = q.isAdmin.get(chatId,me.id);
      if (!adminRow||!adminRow.is_admin) return apiErr(res,403,'Только администратор');
    }
    if (targetId===chat.created_by&&me.id!==targetId) return apiErr(res,403,'Нельзя удалить создателя');
    const removedUser = q.userById.get(targetId);
    q.removeMember.run(chatId,targetId);
    const memberIds = chatMemberIds(chatId);
    const updatedChat = {...q.chatById.get(chatId),members:q.chatMembers.all(chatId)};
    broadcast({type:'chat_updated',chat:updatedChat},memberIds);
    broadcast({type:'removed_from_chat',chat_id:chatId},[targetId]);
    if (removedUser) sendBotMsg(chatId,`👋 ${removedUser.name} покинул группу`,memberIds);
    return apiOk(res,{ok:true});
  }

  const cmMatch = pathname.match(/^\/api\/chats\/([^/]+)\/messages$/);
  if (cmMatch) {
    const chatId = cmMatch[1];
    const me = getAuth(req); if (!me) return apiErr(res,401,'Не авторизован');
    if (!q.isMember.get(chatId,me.id)) return apiErr(res,403,'Нет доступа');
    if (req.method==='GET') return apiOk(res,{messages:q.chatMsgs.all(chatId)});
    if (req.method==='POST') {
      const {type='text',text,media_data,media_name,media_size,media_duration,reply_to} = data;
      if (type==='text'&&!text?.trim()) return apiErr(res,400,'Пустое сообщение');
      const id = uuid(); const now = Date.now();
      q.insertMsg.run(id,chatId,me.id,type,text||null,media_data||null,media_name||null,media_size||null,media_duration||null,reply_to||null);
      const msg = {id,chat_id:chatId,from_id:me.id,type,text:text||null,media_data:media_data||null,media_name:media_name||null,media_size:media_size||null,media_duration:media_duration||null,reply_to:reply_to||null,edited:0,deleted:0,created_at:now};
      const memberIds = chatMemberIds(chatId);
      broadcast({type:'new_message',message:msg},memberIds);

      // Bot1 (@dirtyexpress)
      if (type==='text'&&text) {
        const members = q.chatMembers.all(chatId);
        if (members.some(m=>m.id===BOT1_ID)) {
          const resp = processBot1(text);
          if (resp) setTimeout(()=>sendBotMsg(chatId,resp,memberIds),400);
          else if (!text.startsWith('/')) setTimeout(()=>sendBotMsg(chatId,'🤖 Я отвечаю только на команды. Напиши /help',memberIds),400);
        }
        // Bot2 (@karnizcal)
        if (members.some(m=>m.id===BOT2_ID)) {
          const resp2 = processBot2(text, me.id);
          if (resp2) setTimeout(()=>sendBotMsg2(chatId,resp2,memberIds,me.id),400);
        }
      }
      return apiOk(res,{message:msg});
    }
  }

  const msgMatch = pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (msgMatch) {
    const msgId = msgMatch[1];
    const me = getAuth(req); if (!me) return apiErr(res,401,'Не авторизован');
    const msg = q.getMsg.get(msgId); if (!msg) return apiErr(res,404,'Не найдено');
    if (!q.isMember.get(msg.chat_id,me.id)) return apiErr(res,403,'Нет доступа');
    if (req.method==='PUT') {
      const {text} = data; if (!text?.trim()) return apiErr(res,400,'Пустой текст');
      if (msg.from_id!==me.id) return apiErr(res,403,'Нельзя редактировать чужие');
      q.editMsg.run(text.trim(),msgId,me.id);
      const updated = q.getMsg.get(msgId);
      broadcast({type:'edit_message',message:updated},chatMemberIds(msg.chat_id));
      return apiOk(res,{ok:true,message:updated});
    }
    if (req.method==='DELETE') {
      if (msg.from_id!==me.id) {
        const chat = q.chatById.get(msg.chat_id);
        if (chat?.type==='group') {
          const adminRow = q.isAdmin.get(msg.chat_id,me.id);
          if (!adminRow||!adminRow.is_admin) return apiErr(res,403,'Нет прав');
        } else return apiErr(res,403,'Нельзя');
      }
      q.delMsg.run(msgId,me.id);
      broadcast({type:'delete_message',message_id:msgId,chat_id:msg.chat_id},chatMemberIds(msg.chat_id));
      return apiOk(res,{ok:true});
    }
  }

  // Online status endpoint
  if (pathname==='/api/users/online' && req.method==='GET') {
    const me = getAuth(req); if (!me) return apiErr(res,401,'Не авторизован');
    const ids = (urlObj.searchParams.get('ids')||'').split(',').filter(Boolean);
    const result = {};
    ids.forEach(id => { result[id] = conns.has(id); });
    return apiOk(res, {online: result});
  }

  apiErr(res,404,'Not found');
}

const wss = new WebSocketServer({server});
wss.on('connection', ws => {
  let userId = null;
  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch(e) { return; }
    if (msg.type==='auth') {
      const s = q.getSession.get(msg.token);
      if (!s) { ws.send(JSON.stringify({type:'auth_fail'})); return; }
      userId = s.id;
      if (!conns.has(userId)) conns.set(userId, new Set());
      conns.get(userId).add(ws);
      q.touchUser.run(Date.now(), userId);
      ws.send(JSON.stringify({type:'auth_ok',user_id:userId}));
      const chats = q.userChats.all(userId);
      const contacts = new Set();
      chats.forEach(c => q.chatMemberIds.all(c.id).forEach(r => { if(r.user_id!==userId) contacts.add(r.user_id); }));
      broadcast({type:'user_online',user_id:userId},[...contacts]);
      return;
    }
    if (msg.type==='typing'&&userId&&msg.chat_id) {
      if (!q.isMember.get(msg.chat_id,userId)) return;
      broadcast({type:'typing',chat_id:msg.chat_id,user_id:userId},chatMemberIds(msg.chat_id).filter(id=>id!==userId));
    }
  });
  ws.on('close', () => {
    if (!userId) return;
    const socks = conns.get(userId);
    if (socks) {
      socks.delete(ws);
      if (socks.size===0) {
        conns.delete(userId);
        const chats = q.userChats.all(userId);
        const contacts = new Set();
        chats.forEach(c => q.chatMemberIds.all(c.id).forEach(r => { if(r.user_id!==userId) contacts.add(r.user_id); }));
        broadcast({type:'user_offline',user_id:userId},[...contacts]);
        q.touchUser.run(Date.now(), userId);
      }
    }
  });
  ws.on('error', ()=>{});
});

server.listen(PORT, () => console.log(`🕊️  Голубь v5.0 на порту ${PORT}\n   DB: ${DB_PATH}`));
process.on('SIGTERM', ()=>{ db.close(); process.exit(0); });
process.on('SIGINT',  ()=>{ db.close(); process.exit(0); });
