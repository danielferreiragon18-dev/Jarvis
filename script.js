// =================================================================
// ENVIRONMENT & CONFIGURATION SETUP
// =================================================================
let AZURE_AI_API_KEY = "DaidhRLhUUzXvKLEG2VKy5nhdT6ohvLSLH2RpE086raJraeqtPMpJQQJ99CIACZoyfiXJ3w3AAAAACOGH67";
let FOUNDRY_MODEL = "gpt-5-mini";
let FOUNDRY_PROJECT_ENDPOINT = "https://chatmine.openai.azure.com/openai/v1/chat/completions";

// Asynchronously load and parse config.env directly inside script.js
async function loadEnvConfig() {
  try {
    const response = await fetch('config.env');
    if (!response.ok) {
      console.warn('[ENV] Could not load config.env file.');
      return;
    }
    const text = await response.text();
    const env = {};
    
    text.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const equalsIndex = trimmed.indexOf('=');
      if (equalsIndex !== -1) {
        const key = trimmed.substring(0, equalsIndex).trim();
        let value = trimmed.substring(equalsIndex + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        env[key] = value;
      }
    });

    AZURE_AI_API_KEY = env.AZURE_AI_API_KEY || "";
    FOUNDRY_MODEL = env.FOUNDRY_MODEL || "gpt-5-mini";
    FOUNDRY_PROJECT_ENDPOINT = env.FOUNDRY_PROJECT_ENDPOINT || "";
    console.log('[ENV] Configuration loaded successfully.');
  } catch (err) {
    console.error('[ENV] Failed to load config.env:', err);
  }
}

// Trigger env loading immediately
const envLoadingPromise = loadEnvConfig();



// =================================================================
// APPLICATION STATE
// =================================================================
let sessions = [];
let currentSessionId = null;

// Date Utility
function getUTCTimeString() {
  const now = new Date();
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');// Primary API Message Handler
// Primary API Message Handler
async function handleSendMessage(userText) {
  const chatStream = document.getElementById('chat-stream');
  if (!userText || !userText.trim() || !chatStream) return;

  // Ensure config.env has finished loading
  await envLoadingPromise;

  if (!currentSessionId || !sessions.find(s => s.id === currentSessionId)) {
    const newSession = {
      id: 'session_' + Date.now(),
      title: userText.slice(0, 22) + (userText.length > 22 ? '...' : ''),
      messages: []
    };
    sessions.unshift(newSession);
    currentSessionId = newSession.id;
  }

  const currentSession = sessions.find(s => s.id === currentSessionId);
  if (currentSession.messages.length === 0) {
    currentSession.title = userText.slice(0, 20) + (userText.length > 20 ? '...' : '');
  }

  const timeStr = getUTCTimeString();

  // 1. Add User Message
  currentSession.messages.push({ role: 'user', text: userText, timestamp: timeStr });
  renderSidebarSessions();
  renderChatMessages();
  switchToChatView();

  // 2. Render Loading Row
  const loadingRow = document.createElement('div');
  loadingRow.className = 'chat-row row-ai';
  loadingRow.innerHTML = `
    <div class="msg-author-tag">■ J.A.R.V.I.S.</div>
    <div class="msg-box ai-box">
      <div class="corner-bracket bracket-tl"></div>
      <div class="corner-bracket bracket-tr"></div>
      <div class="corner-bracket bracket-bl"></div>
      <div class="corner-bracket bracket-br"></div>
      <span class="loading-dots">ANALYZING PARAMETERS...</span>
    </div>
    <div class="msg-timestamp">${timeStr} / processing</div>
    <div class="processing-pill active-loading"><span class="spin-icon">↻</span> SYNTHESIZING RESPONSE...</div>
  `;
  chatStream.appendChild(loadingRow);
  chatStream.scrollTop = chatStream.scrollHeight;

  // 3. Validate API Key
  if (!AZURE_AI_API_KEY || AZURE_AI_API_KEY.trim() === '') {
    loadingRow.remove();
    currentSession.messages.push({ 
      role: 'ai', 
      text: '[SYSTEM ERROR]: API Key missing. Please set AZURE_AI_API_KEY in config.env.', 
      timestamp: getUTCTimeString() 
    });
    renderSidebarSessions();
    renderChatMessages();
    return;
  }

  // 4. API Request Execution
  try {
    const headers = { 
      'Content-Type': 'application/json',
      'api-key': AZURE_AI_API_KEY
    };

    const payload = {
      model: FOUNDRY_MODEL,
      messages: [
        { role: 'system', content: 'You are J.A.R.V.I.S., a tactical neural interface AI.' },
        ...currentSession.messages.map(m => ({
          role: m.role === 'ai' ? 'assistant' : 'user',
          content: m.text
        }))
      ]
    };

    const response = await fetch(FOUNDRY_PROJECT_ENDPOINT, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    loadingRow.remove();

    if (!response.ok) {
      const errorDetail = data.error?.message || `HTTP ${response.status} ${response.statusText}`;
      currentSession.messages.push({ role: 'ai', text: `[API ERROR]: ${errorDetail}`, timestamp: getUTCTimeString() });
    } else if (data.choices && data.choices[0]?.message?.content) {
      const botReplyText = data.choices[0].message.content;
      currentSession.messages.push({ role: 'ai', text: botReplyText, timestamp: getUTCTimeString() });
    } else {
      currentSession.messages.push({ role: 'ai', text: '[SYSTEM ERROR]: MALFORMED RESPONSE BODY', timestamp: getUTCTimeString() });
    }
  } catch (err) {
    loadingRow.remove();
    currentSession.messages.push({ role: 'ai', text: `[UPLINK FAILURE]: ${err.message}`, timestamp: getUTCTimeString() });
  }

  // 5. Update UI & Audio Output
  renderSidebarSessions();
  renderChatMessages();
  const lastMsg = currentSession.messages[currentSession.messages.length - 1];
  if (lastMsg && lastMsg.role === 'ai') {
    jarvisVoice.speak(lastMsg.text);
  }
}
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds} UTC`;
}

// Browser-Native Web Speech Engine
class JarvisVoiceEngine {
  constructor() {
    this.synth = window.speechSynthesis;
    this.voice = null;
    this.isMuted = false;
    this.volume = 1.0;
    this.lastText = "";
    this.speaking = false;

    this.initVoice();
    if (this.synth && 'addEventListener' in this.synth) {
      this.synth.addEventListener('voiceschanged', () => this.initVoice());
    }
  }

  initVoice() {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    if (!voices || voices.length === 0) return;

    this.voice = 
      voices.find(v => v.lang.startsWith('en') && v.name.includes('Natural')) ||
      voices.find(v => v.lang.startsWith('en') && (v.name.includes('Male') || v.name.includes('David') || v.name.includes('Google'))) ||
      voices.find(v => v.lang.startsWith('en')) || 
      voices[0];
  }

  speak(text) {
    if (!this.synth) return;
    this.lastText = text;

    if (this.synth.paused) {
      this.synth.resume();
    }
    this.synth.cancel();

    if (this.isMuted) return;

    const utterance = new SpeechSynthesisUtterance(text);
    if (!this.voice) this.initVoice();
    if (this.voice) utterance.voice = this.voice;

    utterance.rate = 0.95;
    utterance.pitch = 0.85;
    utterance.volume = this.volume;

    utterance.onstart = () => {
      this.speaking = true;
      if (typeof jarvisLive !== 'undefined' && jarvisLive.isListening) {
        jarvisLive.recognition.stop();
      }
    };

    utterance.onend = () => {
      this.speaking = false;
      if (typeof jarvisLive !== 'undefined' && jarvisLive.liveModeActive) {
        jarvisLive.start();
      }
    };

    this.synth.speak(utterance);
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.synth && this.synth.speaking && !this.isMuted) {
      this.speak(this.lastText);
    }
  }

  stop() {
    this.speaking = false;
    if (this.synth) this.synth.cancel();
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stop();
    } else if (this.lastText) {
      this.speak(this.lastText);
    }
    return this.isMuted;
  }
}

const jarvisVoice = new JarvisVoiceEngine();

// Primary API Message Handler
// Primary API Message Handler
async function handleSendMessage(userText) {
  const chatStream = document.getElementById('chat-stream');
  if (!userText || !userText.trim() || !chatStream) return;

  if (!currentSessionId || !sessions.find(s => s.id === currentSessionId)) {
    const newSession = {
      id: 'session_' + Date.now(),
      title: userText.slice(0, 22) + (userText.length > 22 ? '...' : ''),
      messages: []
    };
    sessions.unshift(newSession);
    currentSessionId = newSession.id;
  }

  const currentSession = sessions.find(s => s.id === currentSessionId);
  if (currentSession.messages.length === 0) {
    currentSession.title = userText.slice(0, 20) + (userText.length > 20 ? '...' : '');
  }

  const timeStr = getUTCTimeString();

  // 1. Add User Message
  currentSession.messages.push({ role: 'user', text: userText, timestamp: timeStr });
  renderSidebarSessions();
  renderChatMessages();
  switchToChatView();

  // 2. Render Loading Row
  const loadingRow = document.createElement('div');
  loadingRow.className = 'chat-row row-ai';
  loadingRow.innerHTML = `
    <div class="msg-author-tag">■ J.A.R.V.I.S.</div>
    <div class="msg-box ai-box">
      <div class="corner-bracket bracket-tl"></div>
      <div class="corner-bracket bracket-tr"></div>
      <div class="corner-bracket bracket-bl"></div>
      <div class="corner-bracket bracket-br"></div>
      <span class="loading-dots">ANALYZING PARAMETERS...</span>
    </div>
    <div class="msg-timestamp">${timeStr} / processing</div>
    <div class="processing-pill active-loading"><span class="spin-icon">↻</span> SYNTHESIZING RESPONSE...</div>
  `;
  chatStream.appendChild(loadingRow);
  chatStream.scrollTop = chatStream.scrollHeight;

  // 3. Validate API Key
  if (!AZURE_AI_API_KEY || AZURE_AI_API_KEY.trim() === '') {
    loadingRow.remove();
    currentSession.messages.push({ 
      role: 'ai', 
      text: '[SYSTEM ERROR]: API Key missing. Please set AZURE_AI_API_KEY.', 
      timestamp: getUTCTimeString() 
    });
    renderSidebarSessions();
    renderChatMessages();
    return;
  }

  // 4. API Request Execution
  try {
    const headers = { 
      'Content-Type': 'application/json',
      'api-key': AZURE_AI_API_KEY
    };

    const payload = {
      model: FOUNDRY_MODEL,
      messages: [
        { role: 'system', content: 'You are J.A.R.V.I.S., a tactical neural interface AI.' },
        ...currentSession.messages.map(m => ({
          role: m.role === 'ai' ? 'assistant' : 'user',
          content: m.text
        }))
      ]
    };

    const response = await fetch(FOUNDRY_PROJECT_ENDPOINT, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    loadingRow.remove();

    if (!response.ok) {
      const errorDetail = data.error?.message || `HTTP ${response.status} ${response.statusText}`;
      currentSession.messages.push({ role: 'ai', text: `[API ERROR]: ${errorDetail}`, timestamp: getUTCTimeString() });
    } else if (data.choices && data.choices[0]?.message?.content) {
      const botReplyText = data.choices[0].message.content;
      currentSession.messages.push({ role: 'ai', text: botReplyText, timestamp: getUTCTimeString() });
    } else {
      currentSession.messages.push({ role: 'ai', text: '[SYSTEM ERROR]: MALFORMED RESPONSE BODY', timestamp: getUTCTimeString() });
    }
  } catch (err) {
    loadingRow.remove();
    currentSession.messages.push({ role: 'ai', text: `[UPLINK FAILURE]: ${err.message}`, timestamp: getUTCTimeString() });
  }

  // 5. Update UI & Audio Output
  renderSidebarSessions();
  renderChatMessages();
  const lastMsg = currentSession.messages[currentSession.messages.length - 1];
  if (lastMsg && lastMsg.role === 'ai') {
    jarvisVoice.speak(lastMsg.text);
  }
}

// UI Rendering Functions
function renderSidebarSessions() {
  const sessionListContainer = document.getElementById('session-list-container');
  if (!sessionListContainer) return;

  if (sessions.length === 0) {
    sessionListContainer.innerHTML = `
      <div class="session-empty-card">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon">
          <path d="M21 8v13H3V8"></path>
          <path d="M1 3h22v5H1z"></path>
          <path d="M10 12h4"></path>
        </svg>
        <p class="empty-text">No previous sessions.<br><em>Create a new session to begin.</em></p>
      </div>
    `;
    return;
  }

  sessionListContainer.innerHTML = sessions.map(session => {
    const isActive = session.id === currentSessionId ? 'active' : '';
    return `
      <div class="session-item-btn ${isActive}" data-id="${session.id}">
        <div class="session-info">
          <span class="session-title-text">${escapeHTML(session.title)}</span>
          <span class="session-tag">${session.messages.length} msgs</span>
        </div>
        <button class="btn-delete-session" data-delete-id="${session.id}" title="Delete Session">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.session-item-btn').forEach(btn => {
    btn.addEventListener('click', () => selectSession(btn.getAttribute('data-id')));
  });

  document.querySelectorAll('.btn-delete-session').forEach(btn => {
    btn.addEventListener('click', (e) => deleteSession(btn.getAttribute('data-delete-id'), e));
  });
}

function renderChatMessages() {
  const chatStream = document.getElementById('chat-stream');
  const chatSubStatusText = document.getElementById('chat-sub-status-text');
  if (!chatStream || !chatSubStatusText) return;

  const currentSession = sessions.find(s => s.id === currentSessionId);
  
  if (!currentSession || currentSession.messages.length === 0) {
    chatStream.innerHTML = '';
    chatSubStatusText.textContent = "SYSTEM INITIALIZED. AWAITING INPUT.";
    return;
  }

  chatSubStatusText.textContent = `UPLINK ESTABLISHED. ${currentSession.messages.length} EXCHANGES RECORDED.`;

  chatStream.innerHTML = currentSession.messages.map((msg, index) => {
    if (msg.role === 'user') {
      return `
        <div class="chat-row row-user">
          <div class="msg-author-tag">USER •</div>
          <div class="msg-box user-box">${escapeHTML(msg.text)}</div>
          <div class="msg-timestamp">${msg.timestamp}</div>
        </div>
      `;
    } else {
      const isLatest = index === currentSession.messages.length - 1;
      return `
        <div class="chat-row row-ai">
          <div class="msg-author-tag">■ J.A.R.V.I.S.</div>
          <div class="msg-box ai-box">
            <div class="corner-bracket bracket-tl"></div>
            <div class="corner-bracket bracket-tr"></div>
            <div class="corner-bracket bracket-bl"></div>
            <div class="corner-bracket bracket-br"></div>
            ${escapeHTML(msg.text)}
          </div>
          
          <div class="ai-actions-bar">
            <button class="btn-msg-action btn-action-like" title="Like Response">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
            </button>
            <button class="btn-msg-action btn-action-dislike" title="Dislike Response">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path></svg>
            </button>
            <button class="btn-msg-action btn-action-copy" data-text="${escapeHTML(msg.text)}" title="Copy Message">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span class="action-label">COPY</span>
            </button>
            <button class="btn-msg-action btn-action-retry" title="Retry Last Prompt">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
              <span class="action-label">RETRY</span>
            </button>
          </div>

          <div class="msg-timestamp">${msg.timestamp} / local synthesis</div>${isLatest ? `<div class="processing-pill"><span class="spin-icon">↻</span> STANDBY MODE</div>` : ''}
        </div>
      `;
    }
  }).join('');

  chatStream.scrollTop = chatStream.scrollHeight;
  attachMessageActionListeners();
}

function selectSession(id) {
  currentSessionId = id;
  renderSidebarSessions();
  renderChatMessages();
  switchToChatView();
  if (window.innerWidth < 768) closeSidebar();
}

function deleteSession(id, event) {
  event.stopPropagation();
  sessions = sessions.filter(s => s.id !== id);

  if (currentSessionId === id) {
    if (sessions.length > 0) {
      currentSessionId = sessions[0].id;
      renderChatMessages();
      switchToChatView();
    } else {
      currentSessionId = null;
      switchToIntroView();
    }
  }

  renderSidebarSessions();
}

function switchToChatView() {
  document.getElementById('view-intro')?.classList.remove('active');
  document.getElementById('view-chat')?.classList.add('active');
}

function switchToIntroView() {
  document.getElementById('view-chat')?.classList.remove('active');
  document.getElementById('view-intro')?.classList.add('active');
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

function attachMessageActionListeners() {
  document.querySelectorAll('.btn-action-like').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('.chat-row');
      row?.querySelector('.btn-action-dislike')?.classList.remove('active-dislike');
      btn.classList.toggle('active-like');
    };
  });

  document.querySelectorAll('.btn-action-dislike').forEach(btn => {
    btn.onclick = () => {
      const row = btn.closest('.chat-row');
      row?.querySelector('.btn-action-like')?.classList.remove('active-like');
      btn.classList.toggle('active-dislike');
    };
  });

  document.querySelectorAll('.btn-action-copy').forEach(btn => {
    btn.onclick = () => {
      const textToCopy = btn.getAttribute('data-text') || '';
      navigator.clipboard.writeText(textToCopy).then(() => {
        const label = btn.querySelector('.action-label');
        if (label) {
          const originalText = label.textContent;
          label.textContent = 'COPIED!';
          setTimeout(() => label.textContent = originalText, 1500);
        }
      });
    };
  });

  document.querySelectorAll('.btn-action-retry').forEach(btn => {
    btn.onclick = () => {
      jarvisVoice.stop();
      const currentSession = sessions.find(s => s.id === currentSessionId);
      if (!currentSession || currentSession.messages.length === 0) return;

      const lastUserMsg = [...currentSession.messages].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        handleSendMessage(lastUserMsg.text);
      }
    };
  });
}

function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebar-overlay')?.classList.add('active');
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('active');
}

// Global Initialization
let jarvisLive = null;

document.addEventListener('DOMContentLoaded', () => {
  const cursor = document.getElementById('hud-cursor');
  const menuToggleBtn = document.getElementById('menu-toggle-btn');
  const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const introForm = document.getElementById('intro-input-form');
  const introInput = document.getElementById('intro-prompt-input');
  const chatForm = document.getElementById('chat-input-form');
  const chatInput = document.getElementById('chat-prompt-input');
  const micButtons = document.querySelectorAll('.mic-btn');
  const btnNewSession = document.getElementById('btn-new-session');
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const toggleLabelText = document.getElementById('toggle-label-text');
  const btnAudioToggle = document.getElementById('btn-audio-toggle');
  const iconAudioOn = document.getElementById('icon-audio-on');
  const iconAudioOff = document.getElementById('icon-audio-off');
  const audioLabelText = document.getElementById('audio-label-text');
  const volumeWrapper = document.getElementById('volume-wrapper');
  const volumeSlider = document.getElementById('voice-volume-slider');
  const volumeDisplay = document.getElementById('volume-val-display');

  // Smooth Cursor Follower
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let cursorX = mouseX;
  let cursorY = mouseY;

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  function animateCursor() {
    cursorX += (mouseX - cursorX) * 0.18;
    cursorY += (mouseY - cursorY) * 0.18;

    if (cursor) {
      cursor.style.left = `${cursorX}px`;
      cursor.style.top = `${cursorY}px`;
    }
    requestAnimationFrame(animateCursor);
  }
  animateCursor();

  document.addEventListener('mouseover', (e) => {
    if (e.target.closest('button, a, input, .session-item-btn')) {
      cursor?.classList.add('hovered');
    }
  });

  document.addEventListener('mouseout', (e) => {
    if (e.target.closest('button, a, input, .session-item-btn')) {
      cursor?.classList.remove('hovered');
    }
  });

  window.addEventListener('click', (e) => {
    const ripple = document.createElement('div');
    ripple.className = 'click-ripple';
    ripple.style.left = `${e.clientX}px`;
    ripple.style.top = `${e.clientY}px`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 400);
  });

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      document.body.classList.toggle('high-contrast-mode');
      const isHighContrast = document.body.classList.contains('high-contrast-mode');
      if (toggleLabelText) {
        toggleLabelText.textContent = isHighContrast ? 'CONTRAST: BRIGHT' : 'CONTRAST: DARK';
      }
    });
  }

  // Live Speech Recognition Engine
  class JarvisLiveEngine {
    constructor(onResultCallback, onStateChangeCallback) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        alert("Speech Recognition is not supported by your browser. Please use Google Chrome or Microsoft Edge.");
        this.supported = false;
        return;
      }

      this.supported = true;
      this.recognition = new SpeechRecognition();
      this.isListening = false;
      this.liveModeActive = false;
      this.onResultCallback = onResultCallback;
      this.onStateChangeCallback = onStateChangeCallback;

      this.configureEngine();
    }

    configureEngine() {
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isListening = true;
        if (this.onStateChangeCallback) this.onStateChangeCallback(true);
      };

      this.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (this.onResultCallback && transcript.trim() !== '') {
          this.onResultCallback(transcript);
        }
      };

      this.recognition.onerror = (event) => {
        console.error("Speech Recognition Error:", event.error);
        if (event.error === 'not-allowed') {
          alert("Microphone access blocked. Please grant microphone permissions in your browser address bar.");
          this.stop();
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        if (this.liveModeActive && !jarvisVoice.speaking) {
          setTimeout(() => this.start(), 300);
        } else if (!this.liveModeActive) {
          if (this.onStateChangeCallback) this.onStateChangeCallback(false);
        }
      };
    }

    async requestPermissionAndStart() {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        this.start();
      } catch (err) {
        console.error("Microphone Access Denied:", err);
        alert("Microphone access was denied. Enable mic permissions to use voice mode.");
        this.liveModeActive = false;
        if (this.onStateChangeCallback) this.onStateChangeCallback(false);
      }
    }

    start() {
      if (!this.supported || this.isListening) return;
      try {
        this.recognition.start();
      } catch (err) {}
    }

    stop() {
      this.liveModeActive = false;
      this.isListening = false;
      if (this.onStateChangeCallback) this.onStateChangeCallback(false);
      if (!this.supported) return;
      try {
        this.recognition.stop();
      } catch (err) {}
    }

    toggleLiveMode() {
      this.liveModeActive = !this.liveModeActive;
      if (this.liveModeActive) {
        this.requestPermissionAndStart();
      } else {
        this.stop();
      }
      return this.liveModeActive;
    }
  }

  jarvisLive = new JarvisLiveEngine(
    (spokenText) => {
      handleSendMessage(spokenText);
    },
    (activeState) => {
      micButtons.forEach(btn => {
        if (activeState) {
          btn.classList.add('active');
          btn.classList.remove('muted');
        } else {
          btn.classList.remove('active');
        }
      });
    }
  );

  let volumeTimeout = null;
  function triggerVolumeVisibility() {
    if (!volumeWrapper) return;
    volumeWrapper.classList.add('visible');
    if (volumeTimeout) clearTimeout(volumeTimeout);
    volumeTimeout = setTimeout(() => {
      volumeWrapper.classList.remove('visible');
    }, 2000);
  }

  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      const val = e.target.value;
      if (volumeDisplay) volumeDisplay.textContent = `${val}%`;
      jarvisVoice.setVolume(val / 100);
      triggerVolumeVisibility();
    });
  }

  if (btnAudioToggle) {
    btnAudioToggle.addEventListener('click', () => {
      const isMuted = jarvisVoice.toggleMute();
      if (isMuted) {
        iconAudioOn?.classList.add('hidden');
        iconAudioOff?.classList.remove('hidden');
        if (audioLabelText) audioLabelText.textContent = 'VOICE: MUTED';
        btnAudioToggle.classList.add('muted');
      } else {
        iconAudioOff?.classList.add('hidden');
        iconAudioOn?.classList.remove('hidden');
        if (audioLabelText) audioLabelText.textContent = 'VOICE: ACTIVE';
        btnAudioToggle.classList.remove('muted');
      }
      triggerVolumeVisibility();
    });
  }

  if (volumeWrapper) {
    volumeWrapper.addEventListener('mouseenter', triggerVolumeVisibility);
    volumeWrapper.addEventListener('mousemove', triggerVolumeVisibility);
  }

  if (menuToggleBtn) menuToggleBtn.addEventListener('click', openSidebar);
  if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

  if (introForm) {
    introForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!introInput) return;
      const val = introInput.value.trim();
      if (val) {
        introInput.value = '';
        handleSendMessage(val);
      }
    });
  }

  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!chatInput) return;
      const val = chatInput.value.trim();
      if (val) {
        chatInput.value = '';
        handleSendMessage(val);
      }
    });
  }

  if (btnNewSession) {
    btnNewSession.addEventListener('click', () => {
      const newSession = {
        id: 'session_' + Date.now(),
        title: 'New Session',
        messages: []
      };
      sessions.unshift(newSession);
      currentSessionId = newSession.id;
      renderSidebarSessions();
      renderChatMessages();
      switchToIntroView();
    });
  }

  micButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      jarvisVoice.stop();
      const isLiveActive = jarvisLive.toggleLiveMode();
      micButtons.forEach(b => {
        if (isLiveActive) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
    });
  });

  renderSidebarSessions();
});

