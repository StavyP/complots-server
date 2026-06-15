// ── IMAGES ───────────────────────────────────────────────────────────────────
function getCardImage(cardName) {
  const imageMap = {
    "Assassin": "Assassin.png",
    "Comtesse": "Comtesse.png",
    "Capitaine": "Capitaine.png",
    "Ambassadeur": "Ambassadeur.png",
    "Inquisiteur": "Inquisiteur.png",
    "Espion": "Espion.png",
    "Pape": "Pape.png",
    "Justicier": "Justicier.png",
    "Ursuline": "Ursuline.png",
    "Illusionniste": "Illusionniste.png",
    "Bourreau": "Bourreau.png",
    "Maître Chanteur": "MaitreChanteur.png",
    "Croque Mort": "CroqueMort.png",
    "Sorcière": "Sorcière.png",
    "Duchesse": "Duchesse.png",
    "Dos": "Dos.png"
  };

  const fileName = imageMap[cardName];
  
  if (fileName) {
    return `image/${fileName}`;
  }
  return null;
}

// ── CONFIG ───────────────────────────────────────────────────────────────────
const RENDER_URL = 'https://complots-server.onrender.com';
const socket = io(RENDER_URL, { reconnection: true, reconnectionDelay: 2000, reconnectionAttempts: 15 });
let myId = null, roomCode = null, gameState = null, prevTurnId = null, timerInterval = null;
let prevRevealedCounts = {}; // track revealed counts per player for flip animation
let chatMessages = []; // store chat messages for the game

const PRESETS = {
  'classic': {
    '1': { name: '1: Base (Duchesse, Assassin, Capitaine, Ambassadeur, Comtesse)', roster: ['Duchesse','Assassin','Capitaine','Ambassadeur','Comtesse'] },
    '2': { name: '2: Inquisiteur (Duchesse, Assassin, Capitaine, Inquisiteur, Comtesse)', roster: ['Duchesse','Assassin','Capitaine','Inquisiteur','Comtesse'] },
    'custom': { name: '⚙️ Personnaliser...', roster: [] }
  },
  'complots2': {
    '1': { name: '1: Catéchumène', roster: ['Bourreau','Espion','Justicier','Sorcière','Ursuline'] },
    '2': { name: '2: Expert', roster: ['Maître Chanteur','Espion','Pape','Croque Mort','Illusionniste'] },
    '3': { name: '3: Mix Catéchumène', roster: ['Bourreau','Ambassadeur','Capitaine','Sorcière','Duchesse'] },
    '4': { name: '4: Mix Expert', roster: ['Assassin','Inquisiteur','Pape','Croque Mort','Illusionniste'] },
    '5': { name: '5: Mix Finances', roster: ['Maître Chanteur','Espion','Pape','Sorcière','Duchesse'] },
    '6': { name: '6: Mix Fraternité', roster: ['Bourreau','Ambassadeur','Justicier','Comtesse','Ursuline'] },
    '7': { name: '7: Mix Gratifications', roster: ['Maître Chanteur','Inquisiteur','Justicier','Croque Mort','Illusionniste'] },
    'custom': { name: '⚙️ Personnaliser...', roster: [] }
  }
};

const CHARS = {
  'Assassin':       { icon:'☽', css:'classic',   short:'Assassine pour 3 pièces', passive:false },
  'Comtesse':       { icon:'❦', css:'classic',   short:'Bloque Assassin/Bourreau', passive:false },
  'Capitaine':      { icon:'⚓', css:'classic',   short:'Vole 2 pièces · Bloque Vol', passive:false },
  'Ambassadeur':    { icon:'⚜', css:'classic',   short:'Échange cartes · Bloque Vol', passive:false },
  'Inquisiteur':    { icon:'⚖', css:'classic',   short:'Regarde/Échange · Bloque Vol', passive:false },
  'Espion':         { icon:'👁', css:'complots2', short:'Regarde 1 carte · Vole 1 pièce', passive:false },
  'Pape':           { icon:'👑', css:'complots2', short:'Prend 1 pièce à chaque joueur', passive:false },
  'Justicier':      { icon:'⚖', css:'complots2', short:'Vole 2 pièces · Bloque Vol', passive:false },
  'Ursuline':       { icon:'⛪', css:'complots2', short:'Prend 3 au trésor, donne 1', passive:false },
  'Illusionniste':  { icon:'🎩', css:'complots2', short:'Prend 4 pièces · Bloque aide', passive:false },
  'Bourreau':       { icon:'⛏', css:'complots2', short:'Assassine pour 3 pièces', passive:false },
  'Maître Chanteur':{ icon:'📜', css:'complots2', short:'Force la cible à payer 3 ou mourir', passive:false },
  'Croque Mort':    { icon:'⚰️', css:'complots2', short:"Passif : récupère l'or du mort · Bloque assassin", passive:true },
  'Sorcière':       { icon:'🔮', css:'complots2', short:'Passif : +5 pièces quand révélée', passive:true },
  'Duchesse':       { icon:'♛', css:'complots2', short:'Taxes (3 pièces) · Bloque aide', passive:false },
};

// ── TURN NOTIFICATION SOUND ───────────────────────────────────────────────────
function playTurnSound() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    
    // Create a pleasant bell-like sound
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.3);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    osc.start(now);
    osc.stop(now + 0.3);
  } catch(e) {
    console.log('Audio context error:', e);
  }
}

// ── SOCKET ───────────────────────────────────────────────────────────────────
socket.on('connect', () => {
  document.getElementById('connecting').style.display = 'none';
  
  // Restore saved player name
  try {
    const savedName = localStorage.getItem('complots_name');
    if (savedName) document.getElementById('inp-name').value = savedName;
  } catch(e) {}
  
  // Try to rejoin existing session
  try {
    const saved = JSON.parse(localStorage.getItem('complots_session') || 'null');
    if (saved?.roomCode && saved?.playerId) {
      myId = saved.playerId;
      roomCode = saved.roomCode;
      // Try to rejoin, if it fails, we'll go to home screen
      socket.emit('room:rejoin', { roomCode: saved.roomCode, playerId: saved.playerId });
    } else {
      show('home');
    }
  } catch(e) {
    console.error('Session restore error:', e);
    // Clear potentially corrupted session data
    try {
      localStorage.removeItem('complots_session');
    } catch(e2) {}
    show('home');
  }
});

socket.on('connect_error', () => { 
  document.querySelector('.connecting-msg').textContent = 'Serveur en démarrage (~30s)...'; 
});

socket.on('disconnect', () => {
  // On disconnect, be careful with localStorage - only keep current state
  try {
    if (myId && roomCode && gameState) {
      // Update only if we have valid game state
      localStorage.setItem('complots_session', JSON.stringify({ roomCode, playerId: myId }));
    }
  } catch(e) {
    // Ignore localStorage errors on disconnect
  }
});

socket.on('room:rejoin_failed', () => {
  // Session is invalid, clear it and go home
  try {
    localStorage.removeItem('complots_session');
  } catch(e) {}
  show('home');
  toast('❌ Impossible de rejoindre la salle');
});

setTimeout(() => { 
  const c = document.getElementById('connecting'); 
  if(c && c.style.display !== 'none') {
    c.style.display='none';
    show('home');
  }
}, 12000);

function show(id) { 
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); 
  document.getElementById(id).classList.add('active'); 
}

function me() { 
  return gameState?.players.find(p => p.id === myId); 
}

function currentPlayer() { 
  return gameState?.players.find(p => p.id === gameState.currentPlayerId); 
}

function isMyTurn() { 
  return gameState?.currentPlayerId === myId; 
}

function toast(msg, d=2800) { 
  const el=document.getElementById('toast'); 
  el.textContent=msg; 
  el.classList.add('show'); 
  setTimeout(()=>el.classList.remove('show'),d); 
}

socket.on('room:joined', ({ roomCode: rc, playerId }) => {
  roomCode = rc;
  myId = playerId;
  try {
    localStorage.setItem('complots_session', JSON.stringify({ roomCode: rc, playerId }));
  } catch(e) {
    console.error('Could not save session:', e);
  }
  show('lobby');
});

socket.on('room:state', state => {
  try {
    gameState = state;
    renderLobby(state);
  } catch(e) {
    console.error('Lobby render error:', e);
  }
});

socket.on('game:state', state => {
  try {
    gameState = state;
    
    if (state.phase === 'ended' && state.winnerId) {
      const w = state.players.find(p => p.id === state.winnerId);
      document.getElementById('winner-name').textContent = w.name;
      const btnReplay = document.getElementById('btn-replay');
      btnReplay.style.display = state.host === myId ? '' : 'none';
      show('winner');
      return;
    }
    
    if (!state.started) {
      show('lobby');
      document.getElementById('lobby-code').textContent = state.roomCode;
      renderLobby(state);
      return;
    }
    
    // Play sound and show toast when it's your turn
    if (state.currentPlayerId === myId && prevTurnId !== myId) {
      playTurnSound();
      toast('⚔ C\'est votre tour !');
      const gb = document.getElementById('game-body');
      gb?.classList.add('my-turn-flash');
      setTimeout(() => gb?.classList.remove('my-turn-flash'), 900);
    }
    
    prevTurnId = state.currentPlayerId;
    show('game');
    renderGame(state);
  } catch(e) {
    console.error('Game render error:', e);
  }
});

// Chat event from server
socket.on('chat:message', (msg) => {
  try {
    chatMessages.push(msg);
    // Keep only last 50 messages
    if (chatMessages.length > 50) chatMessages.shift();
    updateChatDisplay();
  } catch(e) {
    console.error('Chat message error:', e);
  }
});

// ── LOBBY ─────────────────────────────────────────────────────────────────────
function renderLobby(state) {
  document.getElementById('lobby-players').innerHTML = state.players.map(p => `
    <div class="lobby-player">
      <div class="p-avatar">${p.name.slice(0,2).toUpperCase()}</div>
      <span class="p-lname">${p.name}</span>
      ${p.id === state.host ? '<span class="host-crown">♛</span>' : ''}
    </div>`).join('');

  const isHost = state.host === myId;
  document.getElementById('btn-start').style.display = isHost ? '' : 'none';
  document.getElementById('waiting-note').style.display = isHost ? 'none' : '';
  document.getElementById('host-settings').style.display = isHost ? '' : 'none';
  document.getElementById('guest-settings').style.display = isHost ? 'none' : '';

  if (isHost) {
    const typeSelect = document.getElementById('inp-type');
    const presetSelect = document.getElementById('inp-preset');
    if (!typeSelect.value || typeSelect.value !== state.settings.type) typeSelect.value = state.settings.type || 'classic';
    const currentType = typeSelect.value;
    let optHtml = '';
    for (const key in PRESETS[currentType]) optHtml += `<option value="${key}">${PRESETS[currentType][key].name}</option>`;
    presetSelect.innerHTML = optHtml;
    presetSelect.value = state.settings.preset || '1';
    document.getElementById('inp-duration').value = state.settings.turnDuration || 30;
    document.getElementById('dur-val').textContent = state.settings.turnDuration || 30;
    const customBox = document.getElementById('custom-roster-box');
    if (presetSelect.value === 'custom') { customBox.style.display='block'; renderCustomRosterChoices(currentType); }
    else customBox.style.display = 'none';
  } else {
    // Afficher les settings en lecture seule pour les non-hôtes
    const s = state.settings;
    const rosterHtml = (s.roster||[]).map(c => `<span class="roster-chip">${CHARS[c]?.icon||'?'} ${c}</span>`).join('');
    const typeLabel = s.type === 'complots2' ? 'Complots 2' : 'Complots 1';
    const presetName = PRESETS[s.type]?.[s.preset]?.name || s.preset;
    document.getElementById('settings-preview-box').innerHTML = `
      <div class="settings-preview-row"><span class="settings-preview-label">Version</span>${typeLabel}</div>
      <div class="settings-preview-row"><span class="settings-preview-label">Preset</span>${presetName}</div>
      <div class="settings-preview-row"><span class="settings-preview-label">Timer</span>${s.turnDuration}s</div>
      <div class="roster-chips">${rosterHtml}</div>`;
  }
}

function switchType() {
  const t = document.getElementById('inp-type').value;
  const ps = document.getElementById('inp-preset');
  let h=''; for(const k in PRESETS[t]) h+=`<option value="${k}">${PRESETS[t][k].name}</option>`;
  ps.innerHTML=h; updateSettings();
}

function changePreset() {
  const p=document.getElementById('inp-preset').value;
  const cb=document.getElementById('custom-roster-box');
  if(p==='custom'){cb.style.display='block';renderCustomRosterChoices(document.getElementById('inp-type').value);}
  else cb.style.display='none';
  updateSettings();
}

function renderCustomRosterChoices(type) {
  const c=document.getElementById('custom-choices'); c.innerHTML='';
  Object.keys(CHARS).filter(k=>CHARS[k].css===(type==='complots2'?'complots2':'classic')).forEach(ch=>{
    const ck=gameState?.settings.roster.includes(ch);
    const i=document.createElement('label');
    i.style.cssText='display:flex;align-items:center;gap:8px;font-size:12px;font-family:Cinzel,serif;cursor:pointer';
    i.innerHTML=`<input type="checkbox" name="custom-card" value="${ch}" ${ck?'checked':''} onchange="updateSettings()"> ${CHARS[ch].icon} ${ch}`;
    c.appendChild(i);
  });
}

function updateSettings() {
  if(gameState&&gameState.host!==myId)return;
  const d=parseInt(document.getElementById('inp-duration').value,10);
  document.getElementById('dur-val').textContent=d;
  const type=document.getElementById('inp-type').value;
  const preset=document.getElementById('inp-preset').value;
  let roster=[];
  if(preset==='custom'){const cks=document.querySelectorAll('input[name="custom-card"]:checked');roster=Array.from(cks).map(c=>c.value).slice(0,5);}
  else roster=PRESETS[type][preset]?.roster||[];
  socket.emit('room:settings',{turnDuration:d,type,preset,roster});
}

// ── GAME ──────────────────────────────────────────────────────────────────────
function renderGame(state) {
  const cp = currentPlayer();
  document.getElementById('turn-name').textContent = cp ? cp.name : '—';
  document.getElementById('treasury-val').textContent = `${state.treasury} pièces`;
  const body = document.getElementById('game-body');
  body.innerHTML = '';

  // Marquer les nouvelles cartes révélées depuis le dernier render
  state.players.forEach(p => {
    const prev = prevRevealedCounts[p.id] || 0;
    p._newReveal = p.revealed.length > prev ? p.revealed.length - 1 : -1;
    prevRevealedCounts[p.id] = p.revealed.length;
  });

  // Timer
  body.insertAdjacentHTML('afterbegin', `<div class="timer-container"><div class="timer-bar" id="dyn-timer-bar"></div></div>`);
  startTimerUI(state.timerEnd, state.timerDuration);

  // Joueurs
  const tableDiv = document.createElement('div');
  tableDiv.innerHTML = '<div class="table-label">Tableau de jeu</div>';
  const grid = document.createElement('div'); grid.className = 'players-table';
  state.players.forEach(p => {
    const tile = document.createElement('div');
    tile.className = 'player-tile' + (p.id===state.currentPlayerId?' is-turn':'') + (p.id===myId?' is-me':'') + (p.eliminated?' elim':'');
    
    const revealedSlots = p.revealed.map((c, i) => {
      const img = getCardImage(c);
      const isNew = p._newReveal === i;
      if (img) {
        return `<div class="mini-card revealed${isNew?' card-flip':''}"><img src="${img}" alt="${c}"><div class="mini-card-name">${c}</div></div>`;
      } else {
        return `<div class="mini-card revealed${isNew?' card-flip':''}"><span style="font-size:8px;color:#f4b0b0">${c.slice(0,3)}</span></div>`;
      }
    }).join('');

    const faceDownSlots = Array(p.cardCount).fill(null).map(() => {
      const dosImg = getCardImage('Dos');
      if (dosImg) {
        return `<div class="mini-card face-down"><img src="${dosImg}" alt="dos"></div>`;
      } else {
        return `<div class="mini-card face-down">✦</div>`;
      }
    }).join('');

    const slots = revealedSlots + faceDownSlots;

    tile.innerHTML = `${p.id===state.currentPlayerId&&!p.eliminated?'<div class="turn-crown">♛</div>':''}${p.eliminated?'<span class="elim-skull">💀</span>':''}\r\n      <div class="tile-name">${p.name}${p.id===myId?' (vous)':''}</div>\r\n      <div class="tile-coins">◈ ${p.coins}</div>\r\n      <div class="tile-cards">${slots}</div>`;
    grid.appendChild(tile);
  });
  tableDiv.appendChild(grid); body.appendChild(tableDiv);

  // Main et Chat
  const myP = me();
  if (myP && !myP.eliminated && myP.hand) {
    const sec = document.createElement('div');
    sec.className = 'hand-section';
    
    // Hand cards
    const handCardsHtml = `<div class="hand-cards">${
      myP.hand.map(c => {
        const ch = CHARS[c]||{icon:'?',css:'classic',short:'',passive:false};
        const img = getCardImage(c);
        return `<div class="big-card">
          ${img ? `<img class="card-img" src="${img}" alt="${c}">` : `<div class="card-img-placeholder card-art ${ch.css}">${ch.icon}</div>`}
          <div class="card-body">
            <div class="card-char-name">${c}</div>
            <div class="card-power">${ch.short}</div>
            ${ch.passive?'<div class="card-passive-badge">✦ passif</div>':''}
          </div>
        </div>`;
      }).join('')
    }</div>`;

    // Chat section (à droite)
    const chatSectionHtml = `<div class="chat-section">
      <div class="chat-header">💬 Complot</div>
      <div class="chat-messages" id="chat-messages-list"></div>
      <div class="chat-input-wrap">
        <input type="text" class="chat-input" id="chat-input" placeholder="Votre message..." maxlength="100">
        <button class="chat-btn" onclick="sendChatMessage()">↑</button>
      </div>
    </div>`;

    sec.innerHTML = `<div class="hand-label">Vos cartes secrètes</div>${handCardsHtml}${chatSectionHtml}`;
    body.appendChild(sec);
    
    // Set up chat input handler
    const chatInput = document.getElementById('chat-input');
    chatInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendChatMessage();
      }
    });
    
    // Populate chat messages
    updateChatDisplay();
  }

  // Phase
  const phase = state.phase;
  if (phase==='action' && isMyTurn())         renderActionPanel(body, state);
  else if (phase==='challenge')               renderChallengePanel(body, state);
  else if (phase==='block_challenge')         renderBlockPanel(body, state);
  else if (phase==='pick' && state.pickCtx?.playerId===myId) renderPickPanel(body, state);
  else if (phase==='exchange' && state.exchangeCtx?.playerId===myId) renderExchangePanel(body, state);
  else if (phase==='spy_reveal')              renderSpyPanel(body, state);
  else if (phase==='blackmail_response')      renderBlackmailPanel(body, state);
  else if (phase==='croque_mort')             renderCroqueMortPanel(body, state);
  else {
    const w=document.createElement('div'); w.className='waiting-note';
    w.innerHTML=`En attente de <strong>${cp?.name||'...'}</strong><span class="dots"></span>`;
    body.appendChild(w);
  }

  // Log
  if (state.log?.length) {
    const log=document.createElement('div'); log.className='log-section';
    log.innerHTML=state.log.map(l=>`<div class="log-line">${l}</div>`).join('');
    body.appendChild(log);
  }
}

function updateChatDisplay() {
  const container = document.getElementById('chat-messages-list');
  if (!container) return;
  
  container.innerHTML = chatMessages.map(msg => `
    <div class="chat-message">
      <span class="chat-message-player">${msg.playerName}</span>: ${msg.text}
    </div>
  `).join('');
  
  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  
  const text = input.value.trim();
  if (text.length === 0) return;
  
  socket.emit('chat:send', { text });
  input.value = '';
}

function startTimerUI(timerEnd, durationMs) {
  if(timerInterval)clearInterval(timerInterval);
  const bar=document.getElementById('dyn-timer-bar');
  if(!bar||!timerEnd||!durationMs)return;
  timerInterval=setInterval(()=>{
    const r=timerEnd-Date.now();
    if(r<=0){bar.style.transform='scaleX(0)';bar.style.background='#e85555';clearInterval(timerInterval);}
    else{const pct=r/durationMs;bar.style.transform=`scaleX(${pct})`;bar.style.background=pct<0.25?'#e85555':pct<0.5?'#e8a827':'';}
  },50);
}

// ── ACTION PANEL ──────────────────────────────────────────────────────────────
function renderActionPanel(body, state) {
  const p = me(); const mustCoup = p.coins >= 10;
  const sec=document.createElement('div'); sec.className='action-section';
  sec.innerHTML='<div class="section-title">Votre action</div><div class="actions-grid" id="acts"></div>';
  body.appendChild(sec); const g=sec.querySelector('#acts');
  if(mustCoup){addAct(g,'⚔','Coup d\'État','Obligatoire · '+p.coins+' pièces','danger',()=>openTargetModal('coup'));return;}
  addAct(g,'◈','Revenu','1 pièce · garanti','',()=>doAction('income'));
  addAct(g,'⬆','Aide étrangère','2 pièces · peut être bloquée','',()=>doAction('foreign_aid'));
  state.settings.roster.forEach(char=>{
    switch(char){
      case 'Duchesse':
        addAct(g,CHARS[char].icon,'Taxes',`${char} · 3 pièces`,'char-action',()=>doAction('tax')); break;
      case 'Capitaine': case 'Justicier':
        addAct(g,CHARS[char].icon,'Voler',`${char} · 2 pièces`,'char-action',()=>openTargetModal('steal')); break;
      case 'Assassin': case 'Bourreau':
        addAct(g,CHARS[char].icon,'Assassiner',`${char} · coûte 3`,'char-action danger',()=>openTargetModal('assassinate'),p.coins<3); break;
      case 'Ambassadeur': case 'Inquisiteur':
        addAct(g,CHARS[char].icon,'Échanger',`${char} · changer ses cartes`,'char-action',()=>doAction('exchange')); break;
      case 'Espion':
        addAct(g,CHARS[char].icon,'Espionner',`${char} · voir 1 carte + vole 1`,'char-action',()=>openTargetModal('spy')); break;
      case 'Pape':
        addAct(g,CHARS[char].icon,'Prélever',`${char} · 1 pièce/joueur`,'char-action',()=>doAction('tax_all')); break;
      case 'Ursuline':
        addAct(g,CHARS[char].icon,'Aumône',`${char} · prend 3, donne 1`,'char-action',()=>openTargetModal('tithe')); break;
      case 'Illusionniste':
        addAct(g,CHARS[char].icon,'Extorquer',`${char} · 4 pièces au trésor`,'char-action',()=>doAction('extort4')); break;
      case 'Maître Chanteur':
        addAct(g,CHARS[char].icon,'Chantage',`${char} · payer 3 ou mourir`,'char-action danger',()=>openTargetModal('blackmail')); break;
    }
  });
  addAct(g,'⚔','Coup d\'État','7 pièces · élimine','danger',()=>openTargetModal('coup'),p.coins<7);
}

function addAct(grid,icon,name,desc,cls,cb,disabled=false){
  const b=document.createElement('button');b.className='act-btn '+cls;b.disabled=disabled;b.onclick=cb;b.innerHTML=`<div class="act-icon">${icon}</div><div class="act-label">${name}</div><div class="act-desc">${desc}</div>`;grid.appendChild(b);
}

function doAction(a){socket.emit('action:do',{actionType:a});}
function openTargetModal(a){
  const targets=gameState.players.filter(p=>p.id!==myId&&!p.eliminated).map(p=>({id:p.id,name:p.name}));
  if(targets.length===0){toast('Aucune cible disponible');return;}
  showTargetModal(a,targets);
}
function showTargetModal(actionType,targets){
  const m=document.createElement('div');m.className='target-modal';m.innerHTML=`
    <div class="target-box"><div class="target-title">Choisir une cible</div>
    <div class="target-list">${targets.map(t=>`<button class="target-btn" onclick="selectTarget('${actionType}','${t.id}')">${t.name}</button>`).join('')}</div>
    <button class="target-btn target-cancel" onclick="this.closest('.target-modal').remove()">Annuler</button></div>`;
  document.body.appendChild(m);
}
function selectTarget(actionType,targetId){document.querySelector('.target-modal').remove();socket.emit('action:do',{actionType,targetId});}

function renderChallengePanel(body, state) {
  const pa=state.challengeCtx?.originalAction; if(!pa)return;
  const actor=state.players.find(p=>p.id===pa.actorId); const amEliminated=me()?.eliminated;
  const sec=document.createElement('div'); sec.className='challenge-section';
  sec.innerHTML=`<div class="section-title">⚔ Défi en cours !</div><div class="challenge-message"><strong>${actor?.name}</strong> prétend avoir <strong>${pa.char||'?'}</strong>.</div><div class="phase-btns" id="ch-btns"></div>`;
  body.appendChild(sec);
  if(myId===pa.actorId||amEliminated)return;
  const btns=sec.querySelector('#ch-btns');
  const iHavePassed = state.players.find(p=>p.id===myId)?.hasPassed;
  const passBtn = document.createElement('button');
  passBtn.className = 'ph-btn ph-pass' + (iHavePassed ? ' ph-pass--done' : '');
  passBtn.textContent = iHavePassed ? '✓ Laissé faire' : 'Laisser faire';
  passBtn.disabled = iHavePassed;
  if (!iHavePassed) passBtn.onclick = () => socket.emit('challenge:pass');
  btns.appendChild(passBtn);
  if(pa.contestable!==false) mkbtn(btns,'Contester','ph-contest',()=>socket.emit('challenge:contest'));
  (pa.blockableBy||[]).forEach(c=>{
    if(state.settings.roster.includes(c)){
      const canBlock = !pa.blockTargetOnly || myId===pa.targetId;
      if(canBlock) mkbtn(btns,`Bloquer (${CHARS[c]?.icon||''} ${c})`,'ph-block',()=>socket.emit('challenge:block',{blockChar:c}));
    }
  });
}

function renderBlockPanel(body, state) {
  const ctx = state.challengeCtx; if(!ctx)return;
  const blocker=state.players.find(p=>p.id===ctx.blockerId);
  const orig=state.players.find(p=>p.id===ctx.originalAction?.actorId);
  const sec=document.createElement('div'); sec.className='phase-panel phase-block';
  sec.innerHTML=`<div class="phase-title">🛡 Blocage !</div>
    <div class="phase-desc"><strong>${blocker?.name}</strong> bloque avec <strong>${ctx.blockChar}</strong>.<br>
    ${myId===ctx.originalAction?.actorId?'Acceptez-vous ce blocage ?':`En attente de <strong>${orig?.name}</strong>…`}</div>
    <div class="phase-btns" id="blk-btns"></div>`;
  body.appendChild(sec);
  if(myId===ctx.originalAction?.actorId){
    const btns=sec.querySelector('#blk-btns');
    mkbtn(btns,'Accepter le blocage','ph-pass',()=>socket.emit('challenge:pass'));
    mkbtn(btns,'Contester le blocage','ph-contest',()=>socket.emit('block:contest'));
  }
}

function renderPickPanel(body, state) {
  const ctx=state.pickCtx; if(!ctx||ctx.playerId!==myId)return;
  const sec=document.createElement('div'); sec.className='phase-panel phase-pick';
  sec.innerHTML=`<div class="phase-title">💀 Révéler une carte</div>
    <div class="phase-desc">Choisissez quelle carte retourner face visible.</div>
    <div class="phase-btns">${ctx.options.map(o=>{
      const img=getCardImage(o.card);
      const label=img?`<img src="${img}" style="width:28px;height:38px;object-fit:cover;border-radius:3px;margin-right:6px;vertical-align:middle">${o.card}`:o.card;
      return `<button class="ph-btn ph-pick" onclick="socket.emit('pick:card',{index:${o.index}})">${label}</button>`;
    }).join('')}</div>`;
  body.appendChild(sec);
}

function renderExchangePanel(body, state) {
  const ctx=state.exchangeCtx; if(!ctx||ctx.playerId!==myId)return;
  let sel=[]; const kc=ctx.keepCount;
  const sec=document.createElement('div'); sec.className='exchange-section';
  sec.innerHTML=`<div class="section-title">⚜ Choisissez ${kc} carte(s) à garder</div>
    <div class="exchange-cards" id="ex-cards"></div>
    <div style="margin-top:.75rem"><button class="ph-btn ph-accept" id="ex-confirm" disabled onclick="confirmExchange()">Confirmer</button></div>`;
  body.appendChild(sec);
  ctx.options.forEach((card,i)=>{
    const d=document.createElement('div'); d.className='ex-card';
    const img=getCardImage(card);
    d.innerHTML=img?`<img src="${img}" alt="${card}"><div class="ex-card-label">${card}</div>`:`<div style="padding:14px;font-size:18px">${CHARS[card]?.icon||'?'}</div><div class="ex-card-label">${card}</div>`;
    d.onclick=()=>{
      if(sel.includes(i)){sel=sel.filter(x=>x!==i);d.classList.remove('selected');}
      else if(sel.length<kc){sel.push(i);d.classList.add('selected');}
      document.getElementById('ex-confirm').disabled=sel.length!==kc;
    };
    sec.querySelector('#ex-cards').appendChild(d);
  });
  window._exSel=()=>sel;
}

function confirmExchange(){socket.emit('exchange:pick',{kept:window._exSel?.()});}

function renderSpyPanel(body, state) {
  const ctx=state.spyCtx; const isTheSpy=ctx&&ctx.spyId===myId;
  const sec=document.createElement('div'); sec.className='phase-panel phase-spy';
  if(isTheSpy&&ctx.card){
    const img=getCardImage(ctx.card);
    sec.innerHTML=`<div class="phase-title">👁 Résultat d'espionnage</div>
      <div class="phase-desc">Carte secrète de <strong>${ctx.targetName}</strong> :</div>
      <div class="spy-reveal-card">${img?`<img class="spy-card-img" src="${img}" alt="${ctx.card}">`:''}
        <strong>${ctx.card}</strong> ${CHARS[ctx.card]?.icon||''}
      </div>
      <div class="phase-btns"><button class="ph-btn ph-spy" onclick="socket.emit('spy:ack')">J'ai vu — Continuer</button></div>`;
  } else {
    const spyP=state.players.find(p=>p.id===ctx?.spyId);
    sec.innerHTML=`<div class="phase-title">👁 Espionnage en cours</div>
      <div class="phase-desc">En attente de <strong>${spyP?.name||'l\'espion'}</strong><span class="dots"></span></div>`;
  }
  body.appendChild(sec);
}

function renderBlackmailPanel(body, state) {
  const ctx=state.blackmailCtx; if(!ctx)return;
  const actor=state.players.find(p=>p.id===ctx.actorId);
  const target=state.players.find(p=>p.id===ctx.targetId);
  const isTarget=ctx.targetId===myId; const myCoins=me()?.coins||0;
  const sec=document.createElement('div'); sec.className='phase-panel phase-blackmail';
  sec.innerHTML=`<div class="phase-title">📜 Maître Chanteur !</div>
    <div class="phase-desc"><strong>${actor?.name}</strong> fait chanter <strong>${target?.name}</strong> !<br>
    ${isTarget?`Payez 3 pièces ou perdez une carte.<br><em style="font-size:11px">Vos pièces : ${myCoins}</em>`:`En attente de <strong>${target?.name}</strong>…`}</div>
    <div class="phase-btns" id="bm-btns"></div>`;
  body.appendChild(sec);
  if(isTarget){const b=sec.querySelector('#bm-btns');mkbtn(b,'💰 Payer 3 pièces','ph-pay',()=>socket.emit('blackmail:pay'),myCoins<3);mkbtn(b,'⚔ Résister (perdre une carte)','ph-resist',()=>socket.emit('blackmail:resist'));}
}

function renderCroqueMortPanel(body, state) {
  const ctx=state.croqueMortCtx; if(!ctx)return;
  const myP=me(); const alreadyPassed=state.players.find(p=>p.id===myId)?.hasPassed;
  const sec=document.createElement('div'); sec.className='phase-panel phase-croquemort';
  sec.innerHTML=`<div class="phase-title">⚰️ Héritage disponible</div>
    <div class="phase-desc"><strong>${ctx.deceasedName}</strong> est éliminé avec <strong>${ctx.coins} pièce(s)</strong>.<br>
    Un joueur avec le Croque Mort peut en réclamer l'héritage !</div>
    <div class="phase-btns" id="cm-btns"></div>`;
  body.appendChild(sec);
  if(!alreadyPassed&&!myP?.eliminated){
    const b=sec.querySelector('#cm-btns');
    mkbtn(b,'⚰️ Réclamer l\'héritage','ph-croquemort',()=>socket.emit('croquemort:claim'));
    mkbtn(b,'Passer','ph-pass',()=>socket.emit('croquemort:pass'));
  }
}

function mkbtn(parent,label,cls,cb,disabled=false){
  const b=document.createElement('button');
  b.className='ph-btn '+cls;
  b.textContent=label;
  b.disabled=disabled;
  b.onclick=cb;
  parent.appendChild(b);
}

// ── CONTROLS ──────────────────────────────────────────────────────────────────
function createRoom(){
  const n=document.getElementById('inp-name').value.trim();
  if(!n){document.getElementById('home-err').textContent='Entrez votre nom.';return;}
  document.getElementById('home-err').textContent='';
  try{localStorage.setItem('complots_name',n);}catch(e){}
  socket.emit('room:create',{name:n});
}

function joinRoom(){
  const n=document.getElementById('inp-name').value.trim();
  const c=document.getElementById('inp-code').value.trim().toUpperCase();
  if(!n){document.getElementById('home-err').textContent='Entrez votre nom.';return;}
  if(c.length!==4){document.getElementById('home-err').textContent='Code à 4 lettres requis.';return;}
  document.getElementById('home-err').textContent='';
  try{localStorage.setItem('complots_name',n);}catch(e){}
  socket.emit('room:join',{code:c,name:n});
}

function startGame(){socket.emit('game:start');}
function replayGame(){socket.emit('game:replay');}

function goHome(){
  try{localStorage.removeItem('complots_session');}catch(e){}
  try{localStorage.removeItem('complots_name');}catch(e){}
  location.reload();
}

function confirmAbandon() {
  if (!confirm("Quitter la partie ?")) return;
  socket.emit("room:leave");
}

// ── RULES MODAL ───────────────────────────────────────────────────────────────
function openRules(){
  document.getElementById('rules-modal').style.display='flex';
  buildCardsGrid();
}

function closeRules(){document.getElementById('rules-modal').style.display='none';}

function switchModalTab(tab){
  document.getElementById('tab-rules').classList.toggle('active',tab==='rules');
  document.getElementById('tab-cards').classList.toggle('active',tab==='cards');
  document.getElementById('modal-rules-content').style.display=tab==='rules'?'':'none';
  document.getElementById('modal-cards-content').style.display=tab==='cards'?'':'none';
}

function buildCardsGrid(){
  const grid=document.getElementById('cards-grid');
  if(grid.children.length>0)return;
  const roster=gameState?.settings.roster||[];
  const allCards=Object.keys(CHARS);
  const ordered=[...roster,...allCards.filter(c=>!roster.includes(c))];
  const seen=new Set();
  ordered.forEach(c=>{
    if(seen.has(c))return;seen.add(c);
    const ch=CHARS[c]; const img=getCardImage(c);
    const div=document.createElement('div'); div.className='card-info-item';
    const inRoster=roster.includes(c)?'<span style="color:var(--gold);font-size:8px">★ En jeu</span>':'';
    div.innerHTML=`${img?`<img class="card-info-img" src="${img}" alt="${c}">`:`<div class="card-info-img-placeholder card-art ${ch.css}">${ch.icon}</div>`}
      <div class="card-info-body">
        <div class="card-info-name">${ch.icon} ${c} ${inRoster}</div>
        <div class="card-info-desc">${ch.short}</div>
        <div class="card-info-type">${ch.css==='complots2'?'Complots 2':'Complots 1'}${ch.passive?' · Passif':''}</div>
      </div>`;
    grid.appendChild(div);
  });
}

function leaveRoom() {
  if (confirm("Voulez-vous vraiment quitter la salle ?")) {
    socket.emit('room:leave');
    try{localStorage.removeItem('complots_session');}catch(e){}
    show('home');
  }
}
