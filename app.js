/* ============================================================
   SCORE CEKIH — app.js — Sadewa Corp
   Pure Vanilla JavaScript — No frameworks
   ============================================================ */
'use strict';

// ============================================================
// CONSTANTS
// ============================================================
const ELEMENT_COLORS = ['#39ff6a', '#5fd4ff', '#b06bff', '#ff4d4d'];
const ELEMENT_NAMES = ['dragon', 'tiger', 'eagle', 'cobra'];
const ELEMENT_EMOJIS = ['🐉', '🐯', '🦅', '🐍'];
const ANIMAL_LABELS = ['Dragon', 'Tiger', 'Eagle', 'Cobra'];
const BORDER_IMGS = ['images/border_1.png','images/border_2.png','images/border_3.png','images/border_4.png'];
const ANIMAL_IMGS = ['images/animal_1.png','images/animal_2.png','images/animal_3.png','images/animal_4.png'];
const VIDEO_SRCS = ['video/dragon.mp4','video/tiger.mp4','video/eagle.mp4','video/cobra.mp4'];
const DEFAULT_TARGET = 1000;
const LS_KEY = 'scoreCekih_v7';
const LS_ARCHIVE_KEY = 'scoreCekih_archive_v7';
const LS_MUSIC_KEY = 'scoreCekih_music_v7';

const AI_COMMENTS = [
"Wah, bédana saeutik pisan!",
"Sigana aya nu rék nyusul.",
"Sing ati-ati, nu di handap keur ngudag!",
"Kaayaan beuki panas!",
"Saha nu bakal meunang?",
"Ulah santai heula, masih panjang!",
"Sing fokus!"
];

// ============================================================
// CENTRALIZED STATE
// ============================================================
let gameState = {
  phase: 'setup', // 'setup' | 'game' | 'newround'
  round: 1,
  turn: 1,
  target: DEFAULT_TARGET,
  players: [], // {setupIdx, name, score, stars, burns, burned, tripleBurn, highestScore,
               //  isInRecoveryMode, recoveryStartTurn, consecutiveMinus, lastBurnedTurn,
               //  rankingBefore, rankingAfter, previousRanking}
  ranking: [], // array of setupIdx sorted by score desc
  history: [], // array of history event objects
  burnCandidates: [], // [{attackerIdx, victimIdx}]
  burnConfirmed: false,
  chartData: {turns: [], scores: [[],[],[],[]]},
  aiComment: 'Selamat bermain!',
  undoStack: [],
  currentRoundFirstTurn: true,
  setupTarget: DEFAULT_TARGET
};

let playerArchive = {}; // keyed by name
let bgMusic = null;
let bgMusicVolume = 1.0;
let bgMusicOn = true;
let currentAudioWav = null;
let rewardVideoTimer = null;
let isRewardPlaying = false;
let chartInstance = null;
let modalChartInstance = null;

// =====================
// TURN TIMER
// =====================
let turnTimer = null;
let turnSeconds = 0;
let timerRunning = false;

let said3 = false;
let said5 = false;
let said7 = false;

// ============================================================
// UTILITY
// ============================================================
function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

function playClick() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.3));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
  } catch(e) {
    try {
      const a = new Audio('audio/klik.wav');
      a.volume = 0.5;
      a.play().catch(()=>{});
    } catch(e2) {}
  }
}

function numberToSunda(n) {
    if (n === 0) return 'nol';

    const isNeg = n < 0;
    if (isNeg) n = -n;

    const angka = [
        '',
        'hiji',
        'dua',
        'tilu',
        'opat',
        'lima',
        'genep',
        'tujuh',
        'dalapan',
        'salapan',
        'sapuluh',
        'sabelas',
        'dua belas',
        'tilu belas',
        'opat belas',
        'lima belas',
        'genep belas',
        'tujuh belas',
        'dalapan belas',
        'salapan belas'
    ];

    function helper(num) {
        if (num < 20) return angka[num];

        if (num < 100) {
            const p = Math.floor(num / 10);
            const s = num % 10;
            return angka[p] + ' puluh' + (s ? ' ' + helper(s) : '');
        }

        if (num < 200) {
            return 'saratus' + (num > 100 ? ' ' + helper(num - 100) : '');
        }

        if (num < 1000) {
            const r = Math.floor(num / 100);
            const s = num % 100;
            return angka[r] + ' ratus' + (s ? ' ' + helper(s) : '');
        }

        if (num < 2000) {
            return 'sarébu' + (num > 1000 ? ' ' + helper(num - 1000) : '');
        }

        if (num < 1000000) {
            const r = Math.floor(num / 1000);
            const s = num % 1000;
            return helper(r) + ' rébu' + (s ? ' ' + helper(s) : '');
        }

        if (num < 1000000000) {
            const r = Math.floor(num / 1000000);
            const s = num % 1000000;
            return helper(r) + ' juta' + (s ? ' ' + helper(s) : '');
        }

        return num.toString();
    }

    return (isNeg ? 'min ' : '') + helper(n);
}

function clamp(val, mn, mx) { return Math.max(mn, Math.min(mx, val)); }

function getDangerStatus(score, target) {
  const ratio = score / target;
  if (ratio < 0) return {key: 'critical', label: '🔴 Critical', cls: 'badge-danger-critical'};
  if (ratio < 0.1) return {key: 'danger', label: '🟠 Danger', cls: 'badge-danger-danger'};
  if (ratio < 0.3) return {key: 'caution', label: '🟡 Caution', cls: 'badge-danger-caution'};
  return {key: 'safe', label: '🟢 Safe', cls: 'badge-danger-safe'};
}

// ============================================================
// RANKING CALCULATION
// ============================================================
function calculateRanking(players, previousRanking = null) {
  const indices = players.map((_,i) => i);
  indices.sort((a, b) => {

    const sa = players[a].score;
    const sb = players[b].score;

    // Skor berbeda
    if (sb !== sa) {
        return sb - sa;
    }

    // Skor sama → pakai ranking sebelumnya
    if (previousRanking) {
        return previousRanking.indexOf(a) - previousRanking.indexOf(b);
    }

    // Game baru
    return a - b;
});

return indices;  
}

function getRankOf(setupIdx, ranking) {
  return ranking.indexOf(setupIdx) + 1;
}

// ============================================================
// BURN DETECTION (detectBurnCandidates)
// ============================================================
function detectBurnCandidates(playersBefore, playersAfter, rankBefore, rankAfter, turn) {
  // No burn on first turn of a round
  if (gameState.currentRoundFirstTurn) return [];

  const candidates = [];
  const n = playersBefore.length;

  // Track who just exited recovery this turn
  const justExitedRecovery = new Set();
  for (let i = 0; i < n; i++) {
    const pb = playersBefore[i];
    const pa = playersAfter[i];
    if (pb.isInRecoveryMode && !pa.isInRecoveryMode) {
      justExitedRecovery.add(i);
    }
  }

  for (let attackerIdx = 0; attackerIdx < n; attackerIdx++) {
    const attackerRankBefore = getRankOf(attackerIdx, rankBefore);
    const attackerRankAfter = getRankOf(attackerIdx, rankAfter);

    // Attacker must improve ranking (lower rank number = better)
    if (attackerRankAfter >= attackerRankBefore) continue;

    for (let victimIdx = 0; victimIdx < n; victimIdx++) {
      if (victimIdx === attackerIdx) continue;

      const victimRankBefore = getRankOf(victimIdx, rankBefore);
      const victimRankAfter = getRankOf(victimIdx, rankAfter);

      // Victim must have been above attacker before
      if (victimRankBefore >= attackerRankBefore) continue;

      // Victim must be below attacker now
      if (victimRankAfter <= attackerRankAfter) continue;

      // Victim score after must be > 0
      if (playersAfter[victimIdx].score <= 0) continue;

      // Victim must not be in Recovery Mode
     //if (playersAfter[victimIdx].isInRecoveryMode) continue;

      // Recovery-exited players cannot burn each other this turn
      if (justExitedRecovery.has(attackerIdx) && justExitedRecovery.has(victimIdx)) continue;

      candidates.push({ attackerIdx, victimIdx });
    }
  }

  return candidates;
}

// ============================================================
// RECOVERY MODE UPDATE
// ============================================================
function updateRecoveryStatus(players, currentTurn) {
  for (let p of players) {
    if (p.isInRecoveryMode) {
      // Recovery lasts 1 full turn after the turn they were burned
      if (currentTurn >= p.recoveryStartTurn + 1) {
        p.isInRecoveryMode = false;
        p.recoveryStartTurn = null;
      }
    }
  }
}

// ============================================================
// PROCESS BURN
// ============================================================
function processBurn(selectedVictimIndices) {
  // Group by attacker
  const attackerGroups = {};
  for (let {attackerIdx, victimIdx} of gameState.burnCandidates) {
    if (selectedVictimIndices.includes(victimIdx)) {
      if (!attackerGroups[attackerIdx]) attackerGroups[attackerIdx] = [];
      attackerGroups[attackerIdx].push(victimIdx);
    }
  }

  const burnActions = [];
  let playMulaiDari0 = false;
  for (let [attackerIdxStr, victims] of Object.entries(attackerGroups)) {
    const attackerIdx = parseInt(attackerIdxStr);
    for (let victimIdx of victims) {
      const attacker = gameState.players[attackerIdx];
      const victim = gameState.players[victimIdx];
      victim.score = 0;
      victim.isInRecoveryMode = true;
      victim.recoveryStartTurn = gameState.turn;
      victim.burned = (victim.burned || 0) + 1;
       playMulaiDari0 = true;
      attacker.burns = (attacker.burns || 0) + 1;
      burnActions.push({ attackerIdx, victimIdx, attackerName: attacker.name, victimName: victim.name });

      // History
      gameState.history.unshift({
        type: 'burn',
        round: gameState.round,
        turn: gameState.turn,
        text: `🔥 ${attacker.name} membakar ${victim.name}`
      });

      // Check if victim was burned multiple times → audio
      if (victim.burned >= 1) {
        victim._playMulaiDari0 = true;
      }
    }

    // Triple burn check
    if (victims.length >= 3) {
      gameState.players[attackerIdx].tripleBurn = (gameState.players[attackerIdx].tripleBurn || 0) + 1;
    }
  }

  // Update ranking after burns
  gameState._playMulaiDari0 = playMulaiDari0;
  gameState.ranking = calculateRanking(gameState.players);
  updateArchive();
  checkAchievements();
  saveState();
  renderAll();

  return burnActions;
}

// ============================================================
// LOCAL STORAGE
// ============================================================
function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(gameState));
    localStorage.setItem(LS_ARCHIVE_KEY, JSON.stringify(playerArchive));
    localStorage.setItem(LS_MUSIC_KEY, JSON.stringify({on: bgMusicOn, vol: bgMusicVolume}));
  } catch(e) {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // Merge carefully
      Object.assign(gameState, saved);
      // ensure undoStack exists
      if (!gameState.undoStack) gameState.undoStack = [];
    }
    const arc = localStorage.getItem(LS_ARCHIVE_KEY);
    if (arc) playerArchive = JSON.parse(arc);
    const mus = localStorage.getItem(LS_MUSIC_KEY);
    if (mus) {
      const m = JSON.parse(mus);
      bgMusicOn = m.on !== undefined ? m.on : true;
      bgMusicVolume = m.vol !== undefined ? m.vol : 1.0;
    }
  } catch(e) {}
}

// ============================================================
// ARCHIVE
// ============================================================
function updateArchive() {
  for (let p of gameState.players) {
    if (!p.name) continue;
    if (!playerArchive[p.name]) {
      playerArchive[p.name] = { name: p.name, stars: 0, burns: 0, burned: 0, tripleBurn: 0, highestScore: 0, gamesPlayed: 0 };
    }
    const a = playerArchive[p.name];
    a.stars = Math.max(a.stars || 0, p.stars || 0);
    a.burns = Math.max(a.burns || 0, p.burns || 0);
    a.burned = Math.max(a.burned || 0, p.burned || 0);
    a.tripleBurn = Math.max(a.tripleBurn || 0, p.tripleBurn || 0);
    a.highestScore = Math.max(a.highestScore || 0, p.score || 0, p.highestScore || 0);
  }
}

// ============================================================
// ACHIEVEMENTS
// ============================================================
const ACHIEVEMENT_DEFS = [
  { key: 'tukang_ngocok', label: 'Tukang Ngocok Kartu 🃏', check: p => p.score < 0 },
  { key: 'tukang_bakar', label: 'Tukang Bakar 🔥', check: p => (p.burns||0) >= 3 },
  { key: 'hari_apes', label: 'Hari Apes Gak Ada Yang Tau 😭', check: p => (p.burned||0) >= 5 },
  { key: 'dewa_kartu', label: 'Dewa Kartu 🃏', check: p => (p.highestScore||0) >= 500 },
  { key: 'dewa_segala', label: 'Dewa Dari Segala Dewa 👑', check: p => (p.stars||0) > 1 },
  { key: 'triple_burn', label: 'Triple Burn 🔱', check: p => (p.tripleBurn||0) > 0 }
];

function checkAchievements() {
  for (let p of gameState.players) {
    if (!p.achievements) p.achievements = {};
    for (let def of ACHIEVEMENT_DEFS) {
      if (!p.achievements[def.key] && def.check(p)) {
        p.achievements[def.key] = true;
      }
    }
    p.highestScore = Math.max(p.highestScore || 0, p.score || 0);
  }
}

// ============================================================
// SNAPSHOT FOR UNDO
// ============================================================
function pushUndo() {
  const snap = deepClone({
    players: gameState.players,
    round: gameState.round,
    turn: gameState.turn,
    target: gameState.target,
    ranking: gameState.ranking,
    history: gameState.history,
    burnCandidates: gameState.burnCandidates,
    burnConfirmed: gameState.burnConfirmed,
    chartData: gameState.chartData,
    aiComment: gameState.aiComment,
    currentRoundFirstTurn: gameState.currentRoundFirstTurn
  });
  gameState.undoStack.push(snap);
  if (gameState.undoStack.length > 30) gameState.undoStack.shift();
}

function popUndo() {
  if (!gameState.undoStack || gameState.undoStack.length === 0) return false;
  const snap = gameState.undoStack.pop();
  gameState.players = snap.players;
  gameState.round = snap.round;
  gameState.turn = snap.turn;
  gameState.target = snap.target;
  gameState.ranking = snap.ranking;
  gameState.history = snap.history;
  gameState.burnCandidates = snap.burnCandidates;
  gameState.burnConfirmed = snap.burnConfirmed;
  gameState.chartData = snap.chartData;
  gameState.aiComment = snap.aiComment;
  gameState.currentRoundFirstTurn = snap.currentRoundFirstTurn;
  return true;
}

// ============================================================
// AUDIO / TTS
// ============================================================
function getMaleVoice() {
  return new Promise(resolve => {
    const tryFind = () => {
      const voices = speechSynthesis.getVoices();
      if (!voices.length) return null;
      return voices.find(v => v.lang === 'id-ID' && /male|pria|laki/i.test(v.name))
        || voices.find(v => v.lang === 'id-ID')
        || voices.find(v => v.lang.startsWith('id'))
        || voices[0];
    };
    const v = tryFind();
    if (v) { resolve(v); return; }
    speechSynthesis.onvoiceschanged = () => resolve(tryFind());
    setTimeout(() => resolve(tryFind()), 1500);
  });
}

async function speak(text) {
  return new Promise(async resolve => {
    try {
      speechSynthesis.cancel();
      if (bgMusic && bgMusicOn) bgMusic.volume = 0.15;
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'id-ID';
      utter.rate = 1;
      utter.pitch = 0.8;
      utter.volume = 1;
      utter.voice = await getMaleVoice();
      utter.onend = () => { restoreBgVolume(); resolve(); };
      utter.onerror = () => { restoreBgVolume(); resolve(); };
      speechSynthesis.speak(utter);
    } catch(e) { restoreBgVolume(); resolve(); }
  });
}

function restoreBgVolume() {
  if (bgMusic && bgMusicOn) bgMusic.volume = bgMusicVolume;
}

function playWav(src) {
  return new Promise(resolve => {
    try {
      speechSynthesis.cancel();
      if (bgMusic && bgMusicOn) bgMusic.volume = 0.15;
      const audio = new Audio(src);
      currentAudioWav = audio;
      audio.onended = () => { currentAudioWav = null; restoreBgVolume(); resolve(); };
      audio.onerror = () => { currentAudioWav = null; restoreBgVolume(); resolve(); };
      audio.play().catch(() => { restoreBgVolume(); resolve(); });
    } catch(e) { restoreBgVolume(); resolve(); }
  });
}

function stopAllAudio() {
  speechSynthesis.cancel();
  if (currentAudioWav) {
    currentAudioWav.pause();
    currentAudioWav.currentTime = 0;
    currentAudioWav = null;
  }
  restoreBgVolume();
}

// Shuffle card TTS
function getShufflerIndex() {
  const players = gameState.players;
  // First turn with Tutup Tangan/Triss not implemented separately — fall through to normal logic
  // Find most negative score
  let minScore = Infinity;
  let minIdx = -1;
  for (let i = 0; i < players.length; i++) {
    if (players[i].score < minScore) {
      minScore = players[i].score;
      minIdx = i;
    }
  }
  return minIdx >= 0 ? minIdx : 0;
}

async function runAudioSequence(burnActions) {
  // If there are burns
  if (burnActions && burnActions.length > 0) {
    for (let ba of burnActions) {
      await speak(`${ba.attackerName} ngaduruk ${ba.victimName}`);
      
      const leader = 
[...gameState.players]
    .sort((a, b) => b.score - a.score)[0];

if (leader && ba.victimName === leader.name) {
    await speakGameEvent('burnLeader');
    }
  }
  } 
  // Shuffle card
  const shIdx = getShufflerIndex();
  const shufflerName = gameState.players[shIdx] ? gameState.players[shIdx].name : '';
  if (shufflerName) await speak(`${shufflerName} punten kocok kartuna`);

   if (gameState._playMulaiDari0) {
    gameState._playMulaiDari0 = false;
    await playWav('audio/mulai_dari_0_ya_bapak.wav');
   }
   
  // Total score
for (let p of gameState.players) {

    // Cek stuck
    if (p.score === p.lastScore) {
        p.stuckTurns++;
    } else {
        p.stuckTurns = 0;
    }

    p.lastScore = p.score;

    await speak(`${p.name} meunang ${numberToSunda(p.score)} poin`);
}
  // AI comment
  const comment = AI_COMMENTS[Math.floor(Math.random() * AI_COMMENTS.length)];
  gameState.aiComment = comment;
  renderAIComment();
  await speak(comment);
  
  // ===============================
// Dynamic Game Events
// ===============================

// Leader saat ini
const leader = [...gameState.players].sort((a, b) => b.score - a.score)[0];

if (leader) {
    await speakGameEvent('leader', leader.name);
}

// Unggul lebih dari 200 poin
const sorted = [...gameState.players].sort((a, b) => b.score - a.score);

if (
    sorted.length >= 2 &&
    (sorted[0].score - sorted[1].score) >= 200
) {
    await speakGameEvent('lead200');
}

// Selisih sangat dekat
if (
    sorted.length >= 2 &&
    Math.abs(sorted[0].score - sorted[1].score) <= 50
) {
    await speakGameEvent('close');
}

// Ada pemain minus 100 atau lebih
if (
    gameState.players.some(p => p.score <= -100)
) {
    const minusPlayer = gameState.players.find(p => p.score <= -100);

if (minusPlayer) {
    await speakGameEvent('minus100', minusPlayer.name);
}
    // Ada pemain stuck 2 giliran
const stuckPlayer = gameState.players.find(
    p => p.stuckTurns >= 2
);

if (stuckPlayer) {
    await speakGameEvent('stuck', stuckPlayer.name);
    stuckPlayer.stuckTurns = 0;
}
}
  // Check consecutive minus
  let playMinusOnce = false;

for (let p of gameState.players) {
    if (p._playMinus3) {
        p._playMinus3 = false;
        playMinusOnce = true;
    }
}

if (playMinusOnce) {
    await playWav('audio/kok_minus_terus_sih_gamau_menang.wav');
   }
}
async function speakGameEvent(type, name = '') {

    switch (type) {

        case 'leader':
            await speak(`${name}, ayeuna anjeun nu mingpin.`);
            break;

        case 'lead200':
            await speak('Teruskeun, ulah nepi ka kasusul.');
            break;

        case 'close':
            await speak('Bédana skor beuki deukeut.');
            break;

        case 'burnLeader':
            await speak('Wah, pamimpin kaduruk!');
            break;

        case 'burn':
            await speak('Persaingan beuki panas!');
            break;

        case 'minus100':
    await speak(`${name}, ngopi heula ambeh teu lieur.`);
    break;

        case 'stuck':
    await speak(`${name}, can hudang kénéh? Lila teu nambah poin.`);
    break;
    }

}

function stopTurnTimer() {

    if (turnTimer) {
        clearInterval(turnTimer);
        turnTimer = null;
    }

    timerRunning = false;

}
function updateTurnTimer() {

    const el = document.getElementById('turnTimer');

    if (!el) return;

    const m = String(Math.floor(turnSeconds / 60)).padStart(2, '0');
    const s = String(turnSeconds % 60).padStart(2, '0');

    el.textContent = `${m}:${s}`;

}
function startTurnTimer() {

    turnSeconds = 0;

    said3 = false;
    said5 = false;
    said7 = false;

    updateTurnTimer();

    stopTurnTimer();

    timerRunning = true;

    turnTimer = setInterval(async () => {

        turnSeconds++;

        updateTurnTimer();

        if (turnSeconds === 5 && !said3) {
            said3 = true;
            await speak('Lila... mending nyeduh mi heula.');
        }

        if (turnSeconds === 10 && !said5) {
            said5 = true;
            await speak('Nu séjén geus nungguan.');
        }

        if (turnSeconds === 15 && !said7) {
            said7 = true;
            await speak('Hayu atuh, kartu moal robah sorangan.');
        }

    }, 1000);

}
// ============================================================
// BACKGROUND MUSIC
// ============================================================
const bgPlaylist = [
  'audio/casino_bg.mp3',
  'audio/casino_bg2.mp3',
  'audio/casino_bg3.mp3',
  'audio/casino_bg4.mp3'
];

let currentMusic = 0;

function initBgMusic() {
  try {
    bgMusic = new Audio(bgPlaylist[currentMusic]);
bgMusic.loop = false;
    bgMusic.volume = bgMusicOn ? bgMusicVolume : 0;
     bgMusic.addEventListener('ended', () => {
    currentMusic++;

    if (currentMusic >= bgPlaylist.length) {
        currentMusic = 0;
    }

    bgMusic.src = bgPlaylist[currentMusic];
    bgMusic.play().catch(() => {});
});
    if (bgMusicOn) bgMusic.play().catch(()=>{});
  } catch(e) {}
}

function toggleMusic() {
  bgMusicOn = !bgMusicOn;
  if (bgMusic) {
    if (bgMusicOn) {
    bgMusic.volume = bgMusicVolume;
    bgMusic.play().catch(() => {});
} else {
    bgMusic.pause();
    }
  
  document.getElementById('btn-toggle-music').textContent = bgMusicOn ? '🎵' : '🔇';
}
     saveState();
}

// ============================================================
// PLAYER CARD DOM CREATION
// ============================================================
function createPlayerCards() {
  const grid = document.getElementById('cards-grid');
  grid.innerHTML = '';
  for (let i = 0; i < gameState.players.length; i++) {
    const p = gameState.players[i];
    const elemName = ELEMENT_NAMES[p.setupIdx];
    const elemColor = ELEMENT_COLORS[p.setupIdx];

    // OUTER FRAME
    const frame = document.createElement('div');
    frame.className = `player-frame`;
    frame.style.setProperty('--border-img', `url('${BORDER_IMGS[p.setupIdx]}')`);
    frame.id = `frame-${p.setupIdx}`;
    frame.dataset.setupIdx = p.setupIdx;

    // INNER CARD
    const card = document.createElement('div');
    card.className = `player-card elem-${elemName}`;
    card.id = `card-${p.setupIdx}`;
    card.dataset.setupIdx = p.setupIdx;

    // IDLE ANIMATIONS inside inner card
    const idleGlow = document.createElement('div');
    idleGlow.className = 'idle-glow';

    const idleAura = document.createElement('div');
    idleAura.className = 'idle-aura';

    const particleContainer = document.createElement('div');
    particleContainer.className = 'idle-particles';
    for (let j = 0; j < 5; j++) {
      const pt = document.createElement('div');
      pt.className = 'particle';
      pt.style.cssText = `
        left: ${15 + Math.random() * 70}%;
        top: ${20 + Math.random() * 60}%;
        --dur: ${3 + Math.random() * 3}s;
        --delay: ${Math.random() * 3}s;
        --drift: ${(Math.random() - 0.5) * 30}px;
        background: ${elemColor};
        box-shadow: 0 0 6px ${elemColor};
        animation-delay: var(--delay);
      `;
      particleContainer.appendChild(pt);
    }

    // CARD CONTENT
    const content = document.createElement('div');
    content.className = 'card-content';

    // Top row: rank badge + stars
    const topRow = document.createElement('div');
    topRow.className = 'card-top-row';
    const rankBadge = document.createElement('div');
    rankBadge.className = 'rank-badge';
    rankBadge.id = `rank-badge-${p.setupIdx}`;
    rankBadge.textContent = '#?';
    const starsRow = document.createElement('div');
    starsRow.className = 'stars-row';
    starsRow.id = `stars-row-${p.setupIdx}`;
    topRow.appendChild(rankBadge);
    topRow.appendChild(starsRow);

    // Name
    const nameEl = document.createElement('div');
    nameEl.className = 'card-player-name';
    nameEl.id = `player-name-${p.setupIdx}`;
    nameEl.textContent = p.name || `Pemain ${p.setupIdx + 1}`;

    // Score
    const scoreEl = document.createElement('div');
    scoreEl.className = 'card-score';
    scoreEl.id = `player-score-${p.setupIdx}`;
    scoreEl.dataset.displayed = '0';
    scoreEl.textContent = '0';

    // Badges
    const badgesEl = document.createElement('div');
    badgesEl.className = 'card-badges';
    badgesEl.id = `player-badges-${p.setupIdx}`;

    // Progress bar
    const progressWrap = document.createElement('div');
    progressWrap.className = 'card-progress-wrap';
    const progressBar = document.createElement('div');
    progressBar.className = 'card-progress-bar';
    progressBar.id = `progress-${p.setupIdx}`;
    progressWrap.appendChild(progressBar);

    // Score input row
    const inputRow = document.createElement('div');
    inputRow.className = 'card-input-row';
    const scoreInput = document.createElement('input');
    scoreInput.type = 'number';
    scoreInput.className = 'card-score-input';
    scoreInput.id = `score-input-${p.setupIdx}`;
    scoreInput.placeholder = '±Score';
    scoreInput.min = '-9999';
    scoreInput.max = '1000';
    scoreInput.autocomplete = 'off';
    scoreInput.inputMode = 'numeric';
    inputRow.appendChild(scoreInput);

    content.appendChild(topRow);
    content.appendChild(nameEl);
    content.appendChild(scoreEl);
    content.appendChild(badgesEl);
    content.appendChild(progressWrap);
    content.appendChild(inputRow);

    card.appendChild(idleGlow);
    card.appendChild(idleAura);
    card.appendChild(particleContainer);
    card.appendChild(content);
    frame.appendChild(card);
    grid.appendChild(frame);
  }
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================
function renderAll() {
  renderCards();
  renderHeader();
  renderRankingTab();
  renderHistoryTab();
  renderAchievementTab();
  renderStatsTab();
  renderArchiveTab();
  renderChart();
  renderBurnPanel();
  renderAIComment();
}

function renderCards() {
  const players = gameState.players;
  const ranking = gameState.ranking;

  const prevRankBadges = {};
  players.forEach(p => {
    const badge = document.getElementById(`rank-badge-${p.setupIdx}`);
    if (badge) prevRankBadges[p.setupIdx] = badge.textContent;
  });

  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    const rank = getRankOf(p.setupIdx, ranking);

    // Rank badge
    const rankBadge = document.getElementById(`rank-badge-${p.setupIdx}`);
    if (rankBadge) {
      const newRankText = `#${rank}`;
      if (prevRankBadges[p.setupIdx] !== newRankText) {
        rankBadge.textContent = newRankText;
        rankBadge.classList.remove('bounce');
        void rankBadge.offsetWidth;
        rankBadge.classList.add('bounce');
        setTimeout(() => rankBadge.classList.remove('bounce'), 500);
      }
    }

    // Stars
    const starsRow = document.getElementById(`stars-row-${p.setupIdx}`);
    if (starsRow) {
      starsRow.innerHTML = '';
      for (let s = 0; s < (p.stars || 0); s++) {
        const star = document.createElement('span');
        star.className = 'star-icon';
        star.textContent = '⭐';
        starsRow.appendChild(star);
      }
    }

    // Name
    const nameEl = document.getElementById(`player-name-${p.setupIdx}`);
    if (nameEl) nameEl.textContent = p.name || `Pemain ${p.setupIdx + 1}`;

    // Score (animated counter)
    const scoreEl = document.getElementById(`player-score-${p.setupIdx}`);
    if (scoreEl) {
      const currentDisplayed = parseInt(scoreEl.dataset.displayed !== undefined ? scoreEl.dataset.displayed : '0');
      const targetScore = p.score;
      scoreEl.className = `card-score${p.score < 0 ? ' negative' : ''}`;
      if (currentDisplayed !== targetScore) {
        // Update thumb before animation
        const thumbEl = scoreEl.querySelector('.thumb-down');
        if (p.score < 0 && !thumbEl) {
          const thumb = document.createElement('span');
          thumb.className = 'thumb-down';
          thumb.textContent = ' 👎';
          // First set text, then add thumb
          scoreEl.textContent = String(currentDisplayed);
          scoreEl.appendChild(thumb);
        } else if (p.score >= 0 && thumbEl) {
          thumbEl.remove();
          scoreEl.textContent = String(currentDisplayed);
        }
        animateCounter(scoreEl, currentDisplayed, targetScore);
      } else {
        // Just ensure thumb state is correct
        const thumbEl = scoreEl.querySelector('.thumb-down');
        if (p.score < 0 && !thumbEl) {
          const thumb = document.createElement('span');
          thumb.className = 'thumb-down';
          thumb.textContent = ' 👎';
          scoreEl.appendChild(thumb);
        } else if (p.score >= 0 && thumbEl) {
          thumbEl.remove();
        }
      }
    }

    // Badges
    const badgesEl = document.getElementById(`player-badges-${p.setupIdx}`);
    if (badgesEl) {
      badgesEl.innerHTML = '';
      if (p.isInRecoveryMode) {
        const rb = document.createElement('span');
        rb.className = 'badge badge-recovery';
        rb.textContent = '🔄 Recovery';
        badgesEl.appendChild(rb);
      }
      const danger = getDangerStatus(p.score, gameState.target);
      const db = document.createElement('span');
      db.className = `badge ${danger.cls}`;
      db.textContent = danger.label;
      badgesEl.appendChild(db);
    }

    // Progress bar
    const progressBar = document.getElementById(`progress-${p.setupIdx}`);
    if (progressBar) {
      const pct = clamp((p.score / gameState.target) * 100, 0, 100);
      progressBar.style.width = pct + '%';
    }
  }
}

function animateCounter(el, from, to) {
  el.dataset.displayed = String(to);
  const steps = 20;
  const diff = to - from;
  if (diff === 0) return;
  let step = 0;
  // Clear existing interval
  if (el._counterInterval) clearInterval(el._counterInterval);
  el._counterInterval = setInterval(() => {
    step++;
    const current = Math.round(from + diff * (step / steps));
    const thumbEl = el.querySelector('.thumb-down');
    if (thumbEl) {
      // Only update text node before thumb
      const textNode = Array.from(el.childNodes).find(n => n.nodeType === 3);
      if (textNode) {
        textNode.nodeValue = String(current);
      } else {
        el.insertBefore(document.createTextNode(String(current)), thumbEl);
      }
    } else {
      el.textContent = String(current);
    }
    if (step >= steps) {
      clearInterval(el._counterInterval);
      el._counterInterval = null;
    }
  }, 18);
}

function renderHeader() {
  const hdRound = document.getElementById('hdr-round');
  const hdTurn = document.getElementById('hdr-turn');
  const hdTarget = document.getElementById('hdr-target');
  if (hdRound) hdRound.textContent = gameState.round;
  if (hdTurn) hdTurn.textContent = gameState.turn;
  if (hdTarget) hdTarget.textContent = gameState.target;
}

function renderBurnPanel() {
  const panel = document.getElementById('burn-panel');
  const list = document.getElementById('burn-candidates-list');
  if (!panel || !list) return;

  if (!gameState.burnCandidates || gameState.burnCandidates.length === 0 || gameState.burnConfirmed) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  list.innerHTML = '';

  // Group by attacker
  const groups = {};
  for (let { attackerIdx, victimIdx } of gameState.burnCandidates) {
    const key = attackerIdx;
    if (!groups[key]) groups[key] = { attackerIdx, victims: [] };
    groups[key].victims.push(victimIdx);
  }

  for (let [, g] of Object.entries(groups)) {
    const attackerName = gameState.players[g.attackerIdx]?.name || '?';
    for (let victimIdx of g.victims) {
      const victimName = gameState.players[victimIdx]?.name || '?';
      const item = document.createElement('div');
      item.className = 'burn-candidate-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `burn-cb-${g.attackerIdx}-${victimIdx}`;
      cb.dataset.attacker = g.attackerIdx;
      cb.dataset.victim = victimIdx;
      cb.checked = true;
      const lbl = document.createElement('label');
      lbl.htmlFor = cb.id;
      lbl.textContent = `🔥 ${attackerName} membakar ${victimName}`;
      item.appendChild(cb);
      item.appendChild(lbl);
      list.appendChild(item);
    }
  }
}

function renderAIComment() {
  const el = document.getElementById('ai-comment-text');
  if (el) el.textContent = gameState.aiComment || 'Selamat bermain!';
}

function renderRankingTab() {
  const el = document.getElementById('ranking-list');
  if (!el) return;
  el.innerHTML = '';
  const ranking = gameState.ranking;
  for (let rank = 0; rank < ranking.length; rank++) {
    const setupIdx = ranking[rank];
    const p = gameState.players[setupIdx];
    if (!p) continue;
    const item = document.createElement('div');
    item.className = 'ranking-item';
    item.innerHTML = `
      <span class="r-pos">#${rank + 1}</span>
      <span class="r-pos">${ELEMENT_EMOJIS[setupIdx]}</span>
      <span class="r-name">${p.name}</span>
      <span class="r-score">${p.score}</span>
      <span class="r-stars">${'⭐'.repeat(p.stars || 0)}</span>
    `;
    el.appendChild(item);
  }
}

function renderHistoryTab() {
  const el = document.getElementById('history-list');
  if (!el) return;
  el.innerHTML = '';
  for (let h of (gameState.history || [])) {
    const item = document.createElement('div');
    item.className = `history-item${h.type === 'burn' ? ' burn-hist' : h.type === 'win' ? ' win-hist' : ''}`;
    item.textContent = `R${h.round}T${h.turn}: ${h.text}`;
    el.appendChild(item);
  }
}

function renderAchievementTab() {
  const el = document.getElementById('achievement-list');
  if (!el) return;
  el.innerHTML = '';

  // Collect all unlocked from all players
  const unlocked = new Set();
  for (let p of gameState.players) {
    for (let def of ACHIEVEMENT_DEFS) {
      if (p.achievements && p.achievements[def.key]) unlocked.add(def.key);
    }
  }

  for (let def of ACHIEVEMENT_DEFS) {
    const item = document.createElement('div');
    item.className = `achievement-item${unlocked.has(def.key) ? '' : ' locked'}`;
    item.textContent = def.label;
    el.appendChild(item);
  }
}

function renderStatsTab() {
  const el = document.getElementById('stats-list');
  if (!el) return;
  el.innerHTML = '';
  for (let p of gameState.players) {
    const block = document.createElement('div');
    block.className = 'stats-player-block';
    block.innerHTML = `
      <div class="stats-player-name">${ELEMENT_EMOJIS[p.setupIdx]} ${p.name}</div>
      <div class="stats-row">
        <span>⭐ Stars: <span class="stats-val">${p.stars || 0}</span></span>
        <span>🔥 Burns: <span class="stats-val">${p.burns || 0}</span></span>
        <span>💀 Burned: <span class="stats-val">${p.burned || 0}</span></span>
        <span>🔱 Triple: <span class="stats-val">${p.tripleBurn || 0}</span></span>
        <span>🏆 Best: <span class="stats-val">${p.highestScore || 0}</span></span>
      </div>
    `;
    el.appendChild(block);
  }
}

function renderArchiveTab() {
  const el = document.getElementById('archive-list');
  if (!el) return;
  el.innerHTML = '';
  for (let [name, a] of Object.entries(playerArchive)) {
    const item = document.createElement('div');
    item.className = 'archive-item';
    item.innerHTML = `
      <span class="archive-name">${name}</span>
      <span class="archive-meta">⭐${a.stars||0} 🔥${a.burns||0} 💀${a.burned||0} 🏆${a.highestScore||0}</span>
    `;
    el.appendChild(item);
  }
}

// ============================================================
// CHART (Canvas-based, no library)
// ============================================================
function renderChart() {
  const canvas = document.getElementById('score-chart');
  if (!canvas) return;
  drawChartOnCanvas(canvas, gameState.chartData, 70);
}

function renderModalChart() {
  const canvas = document.getElementById('modal-chart-canvas');
  if (!canvas) return;
  drawChartOnCanvas(canvas, gameState.chartData, 240);
}

function drawChartOnCanvas(canvas, data, height) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.parentElement ? canvas.parentElement.clientWidth : 300;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const turns = data.turns || [];
  const allScores = data.scores || [[],[],[],[]];
  if (turns.length < 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Chart tersedia setelah 2 turn', width/2, height/2);
    return;
  }

  // Calculate bounds
  let minV = 0, maxV = gameState.target;
  for (let arr of allScores) {
    for (let v of arr) {
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
  }
  minV = Math.min(minV, 0);
  maxV = Math.max(maxV, gameState.target);
  const range = maxV - minV || 1;

  const pad = { top: 8, bottom: 14, left: 20, right: 8 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const getX = (i) => pad.left + (i / (turns.length - 1)) * chartW;
  const getY = (v) => pad.top + chartH - ((v - minV) / range) * chartH;

  // Draw grid line at target
  ctx.strokeStyle = 'rgba(255,215,0,0.3)';
  ctx.lineWidth = 0.5;
  ctx.setLineDash([3,3]);
  const targetY = getY(gameState.target);
  ctx.beginPath();
  ctx.moveTo(pad.left, targetY);
  ctx.lineTo(pad.left + chartW, targetY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw zero line
  if (minV < 0) {
    const zeroY = getY(0);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(pad.left, zeroY);
    ctx.lineTo(pad.left + chartW, zeroY);
    ctx.stroke();
  }

  // Draw player lines
  for (let pi = 0; pi < gameState.players.length; pi++) {
    const scores = allScores[pi];
    if (!scores.length) continue;
    const color = ELEMENT_COLORS[gameState.players[pi].setupIdx];
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    for (let ti = 0; ti < turns.length; ti++) {
      const x = getX(ti);
      const y = getY(scores[ti] !== undefined ? scores[ti] : 0);
      ti === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw dots
    for (let ti = 0; ti < turns.length; ti++) {
      const x = getX(ti);
      const y = getY(scores[ti] !== undefined ? scores[ti] : 0);
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  // Axis labels
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < turns.length; i++) {
    if (i % Math.max(1, Math.floor(turns.length / 6)) === 0) {
      ctx.fillText('T' + turns[i], getX(i), height - 2);
    }
  }

  // Legend
  ctx.font = '8px sans-serif';
  for (let pi = 0; pi < gameState.players.length; pi++) {
    const p = gameState.players[pi];
    ctx.fillStyle = ELEMENT_COLORS[p.setupIdx];
    ctx.textAlign = 'left';
    ctx.fillText(p.name ? p.name.slice(0,6) : '?', pad.left + pi * Math.floor(chartW/4), pad.top + 2);
  }
}

// ============================================================
// SAVE TURN
// ============================================================
function handleSaveTurn() {
  playClick();

  // Collect inputs
  const inputs = [];
  let allFilled = true;
  for (let p of gameState.players) {
    const inputEl = document.getElementById(`score-input-${p.setupIdx}`);
    const val = inputEl ? inputEl.value.trim() : '';
    if (val === '') { allFilled = false; break; }
    const num = parseInt(val);
    if (isNaN(num)) { allFilled = false; break; }
    if (num > 1000) { showToast(`Nilai maks 1000 per turn (${p.name})`); return; }
    inputs.push({ setupIdx: p.setupIdx, delta: num });
  }

  if (!allFilled) {
    showToast('Isi semua input skor terlebih dahulu!');
    return;
  }

  // Push undo snapshot
  pushUndo();

  // Save ranking before
  const rankBefore = [...gameState.ranking];
  const playersBefore = deepClone(gameState.players);

  // Apply scores
  for (let inp of inputs) {
    const p = gameState.players.find(pl => pl.setupIdx === inp.setupIdx);
    if (p) {
      p.score += inp.delta;
      // Track consecutive minus
      if (p.score < 0) {
        p.consecutiveMinus = (p.consecutiveMinus || 0) + 1;
        if (p.consecutiveMinus >= 3) {
          p._playMinus3 = true;
          p.consecutiveMinus = 0; // reset after triggering
        }
      } else {
        p.consecutiveMinus = 0;
      }
      p.highestScore = Math.max(p.highestScore || 0, p.score);
    }
  }

  // Update recovery status BEFORE burn check
  updateRecoveryStatus(gameState.players, gameState.turn);

  // Update ranking
  gameState.ranking =
    calculateRanking(gameState.players, rankBefore);
  const rankAfter = [...gameState.ranking];

  // Detect burn candidates
  gameState.burnCandidates = detectBurnCandidates(playersBefore, gameState.players, rankBefore, rankAfter, gameState.turn);
  gameState.burnConfirmed = false;

  // Update chart data
  gameState.chartData.turns.push(gameState.turn);
  for (let i = 0; i < gameState.players.length; i++) {
    if (!gameState.chartData.scores[i]) gameState.chartData.scores[i] = [];
    gameState.chartData.scores[i].push(gameState.players[i].score);
  }

  // History entry
  const scoreText = inputs.map(inp => {
    const p = gameState.players.find(pl => pl.setupIdx === inp.setupIdx);
    return `${p?.name||'?'}:${inp.delta > 0 ? '+' : ''}${inp.delta}`;
  }).join(' ');
  gameState.history.unshift({
    type: 'turn',
    round: gameState.round,
    turn: gameState.turn,
    text: scoreText
  });

  // Check achievements
  checkAchievements();
  updateArchive();

  // Mark first turn done
  gameState.currentRoundFirstTurn = false;

  // Clear inputs
  for (let p of gameState.players) {
    const inputEl = document.getElementById(`score-input-${p.setupIdx}`);
    if (inputEl) inputEl.value = '';
  }

  // Card flip animation
  for (let p of gameState.players) {
    const card = document.getElementById(`card-${p.setupIdx}`);
    if (card) {
      card.classList.remove('card-flipping');
      void card.offsetWidth;
      card.classList.add('card-flipping');
      setTimeout(() => card.classList.remove('card-flipping'), 600);
    }
  }

  // Check win
  const winner = gameState.players.find(p => p.score >= gameState.target);
  if (winner) {
    handleWin(winner);
    return;
  }

  // Increment turn
  gameState.turn += 1;

  saveState();
  renderAll();

  // Audio: only play if no burn candidates
  if (!gameState.burnCandidates || gameState.burnCandidates.length === 0) {
    setTimeout(() => runAudioSequence(null), 300);
  }
  // If burn candidates exist, audio waits for confirm burn
}

// ============================================================
// CONFIRM BURN
// ============================================================
function handleConfirmBurn() {
  playClick();

  // Get checked victims
  const checkboxes = document.querySelectorAll('.burn-candidate-item input[type="checkbox"]:checked');
  const selectedVictims = Array.from(checkboxes).map(cb => parseInt(cb.dataset.victim));

  if (selectedVictims.length === 0) {
    showToast('Pilih minimal 1 korban!');
    return;
  }

  // Get burn actions for audio
  const burnActionsForAudio = [];
  for (let {attackerIdx, victimIdx} of gameState.burnCandidates) {
    if (selectedVictims.includes(victimIdx)) {
      burnActionsForAudio.push({
        attackerIdx,
        victimIdx,
        attackerName: gameState.players[attackerIdx]?.name || '?',
        victimName: gameState.players[victimIdx]?.name || '?'
      });
    }
  }

  // Play attack animation for each burn — SEMUA BARENGAN (paralel),
  // bukan satu-satu bergantian, sesuai kalau 2-3 korban dibakar sekaligus.
  burnActionsForAudio.forEach((ba) => {
    playAttackAnimation(ba.attackerIdx, ba.victimIdx);
  });

  // Process burn setelah animasi sprite sheet selesai.
  // Animasi sekarang PARALEL (flyer ~450ms + overlay ~800ms = ~1250ms total),
  // jadi delay-nya tetap/fixed, tidak lagi dikali jumlah korban.
  setTimeout(() => {
    processBurn(selectedVictims);
    gameState.burnConfirmed = true;
    gameState.burnCandidates = [];
    gameState.turn += 1;
    saveState();
    renderAll();

    // Now run audio
    setTimeout(() => runAudioSequence(burnActionsForAudio), 300);
  }, 1300);
}

// ============================================================
// ATTACK ANIMATION (sprite sheet version)
// ============================================================
// Sprite sheet tiap elemen: 4x4 grid (16 frame), nama file mengikuti
// ELEMENT_NAMES, taruh di folder images/ dengan nama persis:
//   images/dragon_spritesheet.png
//   images/tiger_spritesheet.png
//   images/eagle_spritesheet.png
//   images/cobra_spritesheet.png
const ATTACK_SPRITE_SHEETS = ELEMENT_NAMES.map(name => `images/${name}_spritesheet.png`);

function playAttackAnimation(attackerIdx, victimIdx) {
  const attackerCard = document.getElementById(`card-${attackerIdx}`);
  const victimCard = document.getElementById(`card-${victimIdx}`);
  if (!attackerCard || !victimCard) return;

  const color = ELEMENT_COLORS[attackerIdx];
  const spriteUrl = ATTACK_SPRITE_SHEETS[attackerIdx];

  // Charge attacker (efek lama tetap dipakai, masih relevan)
  attackerCard.classList.remove('card-charging');
  void attackerCard.offsetWidth;
  attackerCard.classList.add('card-charging');
  setTimeout(() => attackerCard.classList.remove('card-charging'), 500);

  // Posisi kartu penyerang & korban (otomatis tau arah dari sini,
  // tidak perlu hitung manual atas/bawah/kiri/kanan).
  const aRect = attackerCard.getBoundingClientRect();
  const vRect = victimCard.getBoundingClientRect();

  const startX = aRect.left + aRect.width / 2;
  const startY = aRect.top + aRect.height / 2;
  const endX = vRect.left + vRect.width / 2;
  const endY = vRect.top + vRect.height / 2;

  // 1) Flyer kecil terbang dari kartu penyerang ke kartu korban,
  //    arah otomatis ikut posisi (atas/bawah/samping/diagonal).
  const container = document.getElementById('projectile-container');
  const flyer = document.createElement('div');
  flyer.className = 'attack-sprite-flyer';
  flyer.style.cssText = `
    left: ${startX}px;
    top: ${startY}px;
    color: ${color};
    background-image: url('${spriteUrl}');
    background-size: 400% 400%;
  `;
  container.appendChild(flyer);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      flyer.style.left = endX + 'px';
      flyer.style.top = endY + 'px';
    });
  });

  setTimeout(() => {
    flyer.remove();

    // 2) Sprite sheet full-size menutupi kartu korban saat impact
    const overlay = document.createElement('div');
    overlay.className = 'attack-sprite-overlay';
    overlay.style.cssText = `
      left: ${vRect.left}px;
      top: ${vRect.top}px;
      width: ${vRect.width}px;
      height: ${vRect.height}px;
      background-image: url('${spriteUrl}');
      background-size: 400% 400%;
    `;
    document.body.appendChild(overlay);
    void overlay.offsetWidth;
    overlay.classList.add('playing');
    setTimeout(() => overlay.remove(), 850);

    // Impact flash on victim
    const flash = document.createElement('div');
    flash.className = 'impact-flash';
    flash.style.background = `radial-gradient(circle, ${color}99 0%, ${color}44 60%, transparent 100%)`;
    victimCard.appendChild(flash);
    setTimeout(() => flash.remove(), 600);

    // Shake victim
    victimCard.classList.remove('card-shake');
    void victimCard.offsetWidth;
    victimCard.classList.add('card-shake');
    setTimeout(() => victimCard.classList.remove('card-shake'), 600);

    // CRITICAL DAMAGE text
    const critEl = document.createElement('div');
    critEl.className = 'critical-damage-text';
    critEl.style.cssText = `
      left: ${endX - 60}px;
      top: ${endY - 30}px;
      color: ${color};
    `;
    critEl.textContent = 'CRITICAL DAMAGE';
    document.body.appendChild(critEl);
    setTimeout(() => critEl.remove(), 1400);

    // Screen shake for triple burn
    if (gameState.burnCandidates.filter(bc => gameState.players[bc.victimIdx]).length >= 3) {
      const appEl = document.getElementById('app');
      if (appEl) {
        appEl.classList.remove('screen-shaking');
        void appEl.offsetWidth;
        appEl.classList.add('screen-shaking');
        setTimeout(() => appEl.classList.remove('screen-shaking'), 600);
      }
    }
  }, 450);
}

// ============================================================
// WIN HANDLER
// ============================================================
async function handleWin(winner) {
  winner.stars = (winner.stars || 0) + 1;
  winner.highestScore = Math.max(winner.highestScore || 0, winner.score);

  // History
  gameState.history.unshift({
    type: 'win',
    round: gameState.round,
    turn: gameState.turn,
    text: `⭐ ${winner.name} meunang béntang`
  });

  // Cancel pending burns
  gameState.burnCandidates = [];
  gameState.burnConfirmed = true;

  checkAchievements();
  updateArchive();
  saveState();
  renderAll();

  // Gold flash
  showGoldFlash();

  // Play reward video
  await playRewardVideo(winner.setupIdx);

  // TTS win
  await speak(`Wilujeng ${winner.name} meunang béntang hiji`);
  await speak('Ronde réngsé. Wilujeng neruskeun kaulinan, tetep fokus');
  // Go to new round
  goToNewRound();
}

function showGoldFlash() {
  const flash = document.createElement('div');
  flash.style.cssText = `
    position: fixed; inset: 0; z-index: 8800;
    background: radial-gradient(ellipse at center, rgba(255,215,0,0.85) 0%, transparent 70%);
    pointer-events: none;
    animation: goldFlash 0.8s ease forwards;
  `;
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 900);
}

async function playRewardVideo(setupIdx) {
  return new Promise(resolve => {
    const overlay = document.getElementById('reward-overlay');
    const video = document.getElementById('reward-video');
    if (!overlay || !video) { resolve(); return; }

    const videoSrc = VIDEO_SRCS[setupIdx];
    if (bgMusic && bgMusicOn) bgMusic.volume = 0.15;

    isRewardPlaying = true;
    overlay.style.display = 'flex';
    video.src = videoSrc;
    video.currentTime = 0;
    video.muted = false;

    // Gold flash inside overlay
    const goldFlash = document.getElementById('reward-gold-flash');
    if (goldFlash) {
      goldFlash.style.animation = 'none';
      void goldFlash.offsetWidth;
      goldFlash.style.animation = 'goldFlash 0.6s ease-out forwards';
    }

    const cleanup = () => {
      isRewardPlaying = false;
      overlay.style.display = 'none';
      video.pause();
      video.src = '';
      if (rewardVideoTimer) { clearTimeout(rewardVideoTimer); rewardVideoTimer = null; }
      restoreBgVolume();
      resolve();
    };

    video.onended = cleanup;
    video.onerror = cleanup;

    rewardVideoTimer = setTimeout(cleanup, 11500);

    video.play().catch(() => {
      // Video failed to load, skip video
      cleanup();
    });
  });
}

// ============================================================
// UNDO
// ============================================================
function handleUndo() {
  playClick();
  stopAllAudio();

  // Stop reward video if playing
  if (isRewardPlaying) {
    const overlay = document.getElementById('reward-overlay');
    const video = document.getElementById('reward-video');
    if (video) { video.pause(); video.src = ''; }
    if (overlay) overlay.style.display = 'none';
    if (rewardVideoTimer) { clearTimeout(rewardVideoTimer); rewardVideoTimer = null; }
    isRewardPlaying = false;
    restoreBgVolume();
  }

  if (popUndo()) {
    saveState();
    renderAll();
    showToast('Undo berhasil!');
  } else {
    showToast('Tidak ada yang bisa di-undo');
  }
}

// ============================================================
// CANCEL BURN
// ============================================================
function handleCancelBurn() {
  playClick();
  gameState.burnCandidates = [];
  gameState.burnConfirmed = true;
  gameState.turn += 1;
  saveState();
  renderAll();
  setTimeout(() => runAudioSequence(null), 300);
}

// ============================================================
// EDIT NAME
// ============================================================
function openEditNameModal() {
  playClick();
  const modal = document.getElementById('modal-edit-name');
  const body = document.getElementById('edit-name-body');
  if (!modal || !body) return;
  body.innerHTML = '';
  for (let p of gameState.players) {
    const row = document.createElement('div');
    row.className = 'edit-name-item';
    const lbl = document.createElement('label');
    lbl.textContent = `${ELEMENT_EMOJIS[p.setupIdx]} P${p.setupIdx + 1}:`;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = p.name;
    input.maxLength = 14;
    input.dataset.setupIdx = p.setupIdx;
    input.id = `edit-input-${p.setupIdx}`;
    row.appendChild(lbl);
    row.appendChild(input);
    body.appendChild(row);
  }
  modal.style.display = 'flex';
}

function saveEditedNames() {
  playClick();
  for (let p of gameState.players) {
    const input = document.getElementById(`edit-input-${p.setupIdx}`);
    if (input && input.value.trim()) {
      p.name = input.value.trim();
    }
  }
  updateArchive();
  saveState();
  renderAll();
  document.getElementById('modal-edit-name').style.display = 'none';
}

// ============================================================
// SETUP → GAME
// ============================================================
function startGame(names, target, isNewRound = false) {
  const prevPlayers = isNewRound ? gameState.players : null;

  gameState.turn = 1;
  gameState.target = target;
  gameState.burnCandidates = [];
  gameState.burnConfirmed = false;
  gameState.currentRoundFirstTurn = true;
  gameState.chartData = { turns: [], scores: [[],[],[],[]] };
  gameState.aiComment = 'Kaulinan dimimitian';

  if (!isNewRound) {
    gameState.round = 1; 
    gameState.history = [];
    gameState.undoStack = [];
    gameState.players = names.map((name, i) => ({
      setupIdx: i,
      name: name || `Pemain ${i + 1}`,
      score: 0,
      stars: 0,
      burns: 0,
      burned: 0,
      tripleBurn: 0,
      highestScore: 0,
      lastScore: 0,
      stuckTurns: 0,
      isInRecoveryMode: false,
      recoveryStartTurn: null,
      consecutiveMinus: 0,
      achievements: {}
    }));
  } else {
    gameState.round += 1;
    gameState.history.unshift({ type: 'round', round: gameState.round, turn: 0, text: `--- Ronde ${gameState.round} dimulai ---` });
    gameState.players = names.map((name, i) => {
      const prev = prevPlayers ? prevPlayers.find(pp => pp.setupIdx === i) : null;
      return {
        setupIdx: i,
        name: name || `Pemain ${i + 1}`,
        score: 0,
        stars: prev ? (prev.stars || 0) : 0,
        burns: prev ? (prev.burns || 0) : 0,
        burned: prev ? (prev.burned || 0) : 0,
        tripleBurn: prev ? (prev.tripleBurn || 0) : 0,
        highestScore: prev ? (prev.highestScore || 0) : 0,
        isInRecoveryMode: false,
        recoveryStartTurn: null,
        consecutiveMinus: 0,
        achievements: prev ? (prev.achievements || {}) : {}
      };
    });
  }

  gameState.ranking = calculateRanking(gameState.players);
  gameState.phase = 'game';

  updateArchive();
  saveState();

  showPage('game');
  createPlayerCards();
  renderAll();

  setTimeout(() => speak('Kaulinan parantos dimimitian'), 500);
  }
// ============================================================
// NEW ROUND
// ============================================================
function goToNewRound() {
  gameState.phase = 'newround';
  showPage('new-round');

  // Pre-fill names from current players
  for (let p of gameState.players) {
    const inp = document.getElementById(`nr-name-${p.setupIdx + 1}`);
    if (inp) inp.value = p.name;
  }

  // Set target buttons
  const nrTargetBtns = document.querySelectorAll('#nr-targets .target-btn');
  nrTargetBtns.forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.val) === gameState.target);
  });

  const nrLabel = document.getElementById('nr-round-label');
  if (nrLabel) nrLabel.textContent = `Ronde ${gameState.round + 1}`;

  saveState();
}

// ============================================================
// RESET GAME
// ============================================================
function handleResetGame() {
  showConfirm('Reset seluruh permainan?', 'Ini akan menghapus sesi aktif. Statistik dan arsip tetap tersimpan.', () => {
    playClick();
    // Preserve cumulative stats but reset active game
    const preservedPlayers = gameState.players.map(p => ({
      setupIdx: p.setupIdx,
      name: p.name,
      stars: p.stars || 0,
      burns: p.burns || 0,
      burned: p.burned || 0,
      tripleBurn: p.tripleBurn || 0,
      highestScore: p.highestScore || 0,
      achievements: p.achievements || {}
    }));

    gameState = {
      phase: 'setup',
      round: 1,
      turn: 1,
      target: DEFAULT_TARGET,
      players: [],
      ranking: [],
      history: [],
      burnCandidates: [],
      burnConfirmed: false,
      chartData: { turns: [], scores: [[],[],[],[]] },
      aiComment: 'Selamat bermain!',
      undoStack: [],
      currentRoundFirstTurn: true,
      setupTarget: DEFAULT_TARGET
    };

    // Restore archive from preserved stats
    for (let p of preservedPlayers) {
      if (playerArchive[p.name]) {
        playerArchive[p.name].stars = Math.max(playerArchive[p.name].stars || 0, p.stars);
        playerArchive[p.name].burns = Math.max(playerArchive[p.name].burns || 0, p.burns);
        playerArchive[p.name].burned = Math.max(playerArchive[p.name].burned || 0, p.burned);
        playerArchive[p.name].tripleBurn = Math.max(playerArchive[p.name].tripleBurn || 0, p.tripleBurn);
        playerArchive[p.name].highestScore = Math.max(playerArchive[p.name].highestScore || 0, p.highestScore);
      }
    }

    saveState();
    showPage('setup');
    stopAllAudio();
  });
}

// ============================================================
// PAGE NAVIGATION
// ============================================================
function showPage(pageName) {
  document.getElementById('page-setup').style.display = 'none';
  document.getElementById('page-game').style.display = 'none';
  document.getElementById('page-new-round').style.display = 'none';

  if (pageName === 'setup') document.getElementById('page-setup').style.display = 'block';
  else if (pageName === 'game') document.getElementById('page-game').style.display = 'flex';
  else if (pageName === 'new-round') document.getElementById('page-new-round').style.display = 'block';
}

// ============================================================
// TABS
// ============================================================
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      playClick();
      const tab = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
      const target = document.getElementById(`tab-${tab}`);
      if (target) target.classList.add('active');
      if (tab === 'chart') renderChart();
    });
  });
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function showToast(msg, duration = 2000) {
  const existing = document.querySelector('.toast-msg');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast-msg';
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.85);
    color: #fff;
    padding: 8px 18px;
    border-radius: 20px;
    font-size: 0.8rem;
    z-index: 9000;
    pointer-events: none;
    border: 1px solid rgba(255,215,0,0.3);
    box-shadow: 0 2px 12px rgba(0,0,0,0.5);
    animation: fadeInUp 0.3s ease;
    white-space: nowrap;
  `;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 350); }, duration);
}

// ============================================================
// CONFIRM MODAL
// ============================================================
function showConfirm(title, body, onYes) {
  const modal = document.getElementById('modal-confirm');
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-body').textContent = body;
  modal.style.display = 'flex';
  document.getElementById('confirm-yes').onclick = () => {
    modal.style.display = 'none';
    onYes();
  };
  document.getElementById('confirm-no').onclick = () => {
    modal.style.display = 'none';
  };
}

// ============================================================
// SCREENSHOT
// ============================================================
async function handleScreenshot() {
  playClick();
  try {
    if (navigator.share) {
      const canvas = await html2canvas(document.getElementById('cards-grid'));
      canvas.toBlob(async blob => {
        const file = new File([blob], 'score_cekih.png', { type: 'image/png' });
        await navigator.share({ files: [file] });
      });
    } else {
      showToast('Screenshot: gunakan screenshot OS');
    }
  } catch(e) {
    showToast('Screenshot: gunakan screenshot OS');
  }
}

// ============================================================
// FULLSCREEN
// ============================================================
function handleFullscreen() {
  playClick();
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

// ============================================================
// SETUP TARGET BUTTONS
// ============================================================
function initSetupTargetBtns(containerSelector, customInputId) {
  const btns = document.querySelectorAll(`${containerSelector} .target-btn`);
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      playClick();
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const customInput = document.getElementById(customInputId);
      if (customInput) customInput.value = '';
    });
  });
}

function getSelectedTarget(containerSelector, customInputId, defaultVal = DEFAULT_TARGET) {
  const customInput = document.getElementById(customInputId);
  if (customInput && customInput.value.trim()) {
    const v = parseInt(customInput.value);
    if (!isNaN(v) && v >= 100) return v;
  }
  const active = document.querySelector(`${containerSelector} .target-btn.active`);
  if (active) return parseInt(active.dataset.val);
  return defaultVal;
}

// ============================================================
// LOADING SCREEN
// ============================================================
function runLoadingScreen(onDone) {
  const bar = document.getElementById('loading-bar');
  const textEl = document.getElementById('loading-text');
  const steps = [
    { pct: 20, text: 'Memuat aset...' },
    { pct: 50, text: 'Membaca data tersimpan...' },
    { pct: 80, text: 'Memulihkan sesi...' },
    { pct: 100, text: 'Siap!' }
  ];
  let idx = 0;
  const interval = setInterval(() => {
    if (idx >= steps.length) {
      clearInterval(interval);
      setTimeout(() => {
        const screen = document.getElementById('loading-screen');
        screen.classList.add('fade-out');
        setTimeout(onDone, 750);
      }, 400);
      return;
    }
    if (bar) bar.style.width = steps[idx].pct + '%';
    if (textEl) textEl.textContent = steps[idx].text;
    idx++;
  }, 450);
}

// ============================================================
// SERVICE WORKER REGISTRATION
// ============================================================
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[SW] Registered successfully, scope:', reg.scope);
      })
      .catch((err) => {
        console.error('[SW] Registration FAILED:', err);
      });
  } else {
    console.warn('[SW] serviceWorker API not available in this browser.');
  }
}

// ============================================================
// MAIN INIT
// ============================================================
function init() {

  loadState();
  registerSW();

  runLoadingScreen(() => {
    document.getElementById('app').style.display = 'block';
    initBgMusic();
    initTabs();
    initSetupTargetBtns('.setup-targets', 'setup-custom-target');
    initSetupTargetBtns('#nr-targets', 'nr-custom-target');
    bindEvents();

    // Restore state
    if (gameState.phase === 'game') {
      showPage('game');
      createPlayerCards();
      renderAll();
    } else if (gameState.phase === 'newround') {
      showPage('new-round');
      for (let p of gameState.players) {
        const inp = document.getElementById(`nr-name-${p.setupIdx + 1}`);
        if (inp) inp.value = p.name;
      }
    } else {
      showPage('setup');
    }
  });
}

// ============================================================
// EVENT BINDINGS
// ============================================================
function bindEvents() {

  // START GAME
  document.getElementById('btn-start-game').addEventListener('click', () => {
    playClick();
    const names = [
      document.getElementById('setup-name-1').value.trim() || 'Dragon',
      document.getElementById('setup-name-2').value.trim() || 'Tiger',
      document.getElementById('setup-name-3').value.trim() || 'Eagle',
      document.getElementById('setup-name-4').value.trim() || 'Cobra'
    ];
    const target = getSelectedTarget('.setup-targets', 'setup-custom-target', DEFAULT_TARGET);
    startGame(names, target, false);
  });

  // START NEW ROUND
  document.getElementById('btn-start-new-round').addEventListener('click', () => {
    playClick();
    const names = [
      document.getElementById('nr-name-1').value.trim() || 'Dragon',
      document.getElementById('nr-name-2').value.trim() || 'Tiger',
      document.getElementById('nr-name-3').value.trim() || 'Eagle',
      document.getElementById('nr-name-4').value.trim() || 'Cobra'
    ];
    const target = getSelectedTarget('#nr-targets', 'nr-custom-target', gameState.target);
    startGame(names, target, true);
  });

  // SAVE TURN
  document.getElementById('btn-save-turn').addEventListener('click', handleSaveTurn);

  // UNDO
  document.getElementById('btn-undo').addEventListener('click', handleUndo);

  // EDIT NAME
  document.getElementById('btn-edit-name').addEventListener('click', openEditNameModal);
  document.getElementById('btn-save-names').addEventListener('click', saveEditedNames);
  document.getElementById('btn-cancel-names').addEventListener('click', () => {
    document.getElementById('modal-edit-name').style.display = 'none';
  });

  // CONFIRM BURN
  document.getElementById('btn-confirm-burn').addEventListener('click', handleConfirmBurn);
  document.getElementById('btn-cancel-burn').addEventListener('click', handleCancelBurn);

  // TURN TIMER
document.getElementById('btn-turn-timer').addEventListener('click', () => {
    playClick();
    startTurnTimer();
});

document.getElementById('btn-stop-timer').addEventListener('click', () => {
    playClick();
    stopTurnTimer();
});
  document.getElementById('btn-close-chart').addEventListener('click', () => {
    document.getElementById('modal-chart').style.display = 'none';
  });

  // MUSIC TOGGLE
  document.getElementById('btn-toggle-music').addEventListener('click', toggleMusic);
  document.getElementById('btn-toggle-music').textContent = bgMusicOn ? '🎵' : '🔇';

  // FULLSCREEN
  document.getElementById('btn-fullscreen').addEventListener('click', handleFullscreen);

  // SCREENSHOT
  document.getElementById('btn-screenshot').addEventListener('click', handleScreenshot);

  // LIGHT MODE
  document.getElementById('btn-light-mode').addEventListener('click', () => {
    playClick();
    document.body.classList.toggle('light-mode');
  });

  // RESET GAME
  document.getElementById('btn-reset-game').addEventListener('click', handleResetGame);

  // ARCHIVE FROM SETUP
  document.getElementById('btn-open-archive-from-setup').addEventListener('click', () => {
    playClick();
    // Show archive in a mini modal
    let html = '<div style="max-height:200px;overflow-y:auto;">';
    for (let [name, a] of Object.entries(playerArchive)) {
      html += `<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1);font-size:0.78rem;">
        <b style="color:var(--gold)">${name}</b> — ⭐${a.stars||0} 🔥${a.burns||0} 💀${a.burned||0} 🏆${a.highestScore||0}
      </div>`;
    }
    if (!Object.keys(playerArchive).length) html += '<div style="color:var(--text-dim);font-size:0.78rem;">Belum ada arsip.</div>';
    html += '</div>';
    showConfirm('📚 Arsip Pemain', '', () => {});
    document.getElementById('confirm-body').innerHTML = html;
    document.getElementById('confirm-yes').style.display = 'none';
    document.getElementById('confirm-no').textContent = 'Tutup';
    document.getElementById('confirm-no').onclick = () => {
      document.getElementById('modal-confirm').style.display = 'none';
      document.getElementById('confirm-yes').style.display = 'block';
      document.getElementById('confirm-no').textContent = 'Batal';
    };
  });

  // KEYBOARD: Enter on score input
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && gameState.phase === 'game') {
      handleSaveTurn();
    }
  });

  // Close modals on overlay click
  document.getElementById('modal-edit-name').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
  });
  document.getElementById('modal-confirm').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
  });
  document.getElementById('modal-chart').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
  });

  // Handle input limits on score inputs (delegated)
  document.addEventListener('input', (e) => {
    if (e.target.classList.contains('card-score-input')) {
      const val = parseInt(e.target.value);
      if (!isNaN(val) && val > 1000) {
        e.target.value = 1000;
        showToast('Nilai maks 1000 per turn');
      }
    }
  });
}

// ============================================================
// START
// ============================================================
document.addEventListener('DOMContentLoaded', init);
