// BeatMarket — Audio Player Engine

const Player = (() => {
  const PREVIEW_LIMIT = 30; // seconds — preview cap before buy prompt

  let audio = new Audio();
  let currentBeat = null;
  let isPlaying = false;
  let queue = [];
  let queueIndex = 0;
  let isDragging = false;
  let previewWarned = false; // tracks if "5s left" warning was shown

  const miniPlayer    = document.getElementById("mini-player");
  const miniCover     = document.getElementById("mini-cover");
  const miniTitle     = document.getElementById("mini-title");
  const miniProducer  = document.getElementById("mini-producer");
  const playPauseBtn  = document.getElementById("play-pause-btn");
  const playPauseIcon = document.getElementById("play-pause-icon");
  const progressBar   = document.getElementById("progress-bar");
  const progressFill  = document.getElementById("progress-fill");
  const progressThumb = document.getElementById("progress-thumb");
  const currentTimeEl = document.getElementById("current-time");
  const durationEl    = document.getElementById("duration");
  const miniAddBtn    = document.getElementById("mini-add-btn");
  const miniWaveform  = document.getElementById("mini-waveform");

  function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // ── Preview limit enforcement ─────────────────────────────────────
  function checkPreviewLimit() {
    if (!currentBeat || audio.currentTime < PREVIEW_LIMIT) return;

    // Stop playback at 30s
    audio.pause();
    audio.currentTime = 0;
    isPlaying = false;
    previewWarned = false;
    updatePlayButtons(false);
    animateWaveform(false);

    // Show buy prompt overlay
    showBuyPrompt(currentBeat);
  }

  function showBuyPrompt(beat) {
    // Remove any existing prompt
    const existing = document.getElementById("preview-buy-prompt");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "preview-buy-prompt";
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      background:rgba(0,0,0,0.82);
      display:flex;align-items:center;justify-content:center;
      backdrop-filter:blur(8px);
      animation:fadeInUp 0.35s ease;
    `;

    overlay.innerHTML = `
      <div style="
        background:linear-gradient(145deg,#13131e,#1a1a2e);
        border:1px solid rgba(168,85,247,0.35);
        border-radius:20px;
        padding:2.5rem 2rem;
        max-width:420px;
        width:90%;
        text-align:center;
        box-shadow:0 30px 80px rgba(0,0,0,0.7),0 0 60px rgba(124,58,237,0.15);
        position:relative;
      ">
        <!-- Close -->
        <button onclick="document.getElementById('preview-buy-prompt').remove()"
          style="position:absolute;top:1rem;right:1rem;background:none;border:none;color:#6b7280;font-size:1.3rem;cursor:pointer;line-height:1">×</button>

        <!-- Beat info -->
        <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;text-align:left">
          <img src="${beat.cover || beat.cover_url || ''}" alt="${beat.title}"
            style="width:64px;height:64px;border-radius:10px;object-fit:cover;flex-shrink:0">
          <div>
            <div style="font-size:1rem;font-weight:800;color:#e2e2f0">${beat.title}</div>
            <div style="font-size:0.82rem;color:#9999bb">Prod. by ${beat.producer || beat.producerName || ''}</div>
          </div>
        </div>

        <!-- Waveform animation -->
        <div style="display:flex;align-items:center;justify-content:center;gap:3px;height:40px;margin-bottom:1.5rem">
          ${Array.from({length:20},(_,i)=>`
            <div style="width:3px;border-radius:2px;background:linear-gradient(to top,#7c3aed,#a855f7);
              height:${8 + Math.sin(i*0.7)*18}px;opacity:0.5"></div>
          `).join('')}
        </div>

        <!-- Message -->
        <div style="font-size:1.25rem;font-weight:900;color:#e2e2f0;margin-bottom:0.5rem">
          🎵 30s Preview Ended
        </div>
        <p style="font-size:0.9rem;color:#9999bb;margin-bottom:1.75rem;line-height:1.5">
          You've heard the vibe. Get the full beat with an exclusive license and own it forever.
        </p>

        <!-- CTA Buttons -->
        <div style="display:flex;flex-direction:column;gap:0.75rem">
          <button id="prompt-buy-btn"
            style="padding:0.9rem 1.5rem;border-radius:12px;
              background:linear-gradient(135deg,#7c3aed,#a855f7);
              color:#fff;font-weight:800;font-size:1rem;border:none;cursor:pointer;
              box-shadow:0 4px 20px rgba(124,58,237,0.4);
              transition:transform 0.15s,box-shadow 0.15s">
            🛒 Get License — from $${parseFloat(beat.price||0).toFixed(2)}
          </button>
          <button onclick="document.getElementById('preview-buy-prompt').remove();Player.loadBeat(currentBeatRef,queue)"
            style="padding:0.7rem;border-radius:10px;
              background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
              color:#9999bb;font-size:0.85rem;cursor:pointer;transition:background 0.15s"
            onmouseover="this.style.background='rgba(255,255,255,0.08)'"
            onmouseout="this.style.background='rgba(255,255,255,0.05)'">
            ▶ Replay 30s Preview
          </button>
        </div>

        <p style="margin-top:1.25rem;font-size:0.75rem;color:#4b4b6b">
          All licenses include instant download · Non-exclusive unless stated
        </p>
      </div>
    `;

    // Wire up buy button
    document.body.appendChild(overlay);

    // Close on backdrop click
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Buy button opens license modal
    const buyBtn = document.getElementById("prompt-buy-btn");
    if (buyBtn && typeof Cart !== "undefined") {
      buyBtn.addEventListener("click", () => {
        overlay.remove();
        Cart.openLicenseModal(beat);
      });
    }

    // Hover effect on buy button
    if (buyBtn) {
      buyBtn.addEventListener("mouseover", () => {
        buyBtn.style.transform = "translateY(-2px)";
        buyBtn.style.boxShadow = "0 6px 28px rgba(124,58,237,0.55)";
      });
      buyBtn.addEventListener("mouseout", () => {
        buyBtn.style.transform = "";
        buyBtn.style.boxShadow = "0 4px 20px rgba(124,58,237,0.4)";
      });
    }
  }

  // ── Progress update (with preview limit check) ────────────────────
  function updateProgress() {
    if (!audio.duration || isDragging) return;

    // Cap progress display to 30s
    const capped = Math.min(audio.currentTime, PREVIEW_LIMIT);
    const pct = (capped / PREVIEW_LIMIT) * 100;
    progressFill.style.width = pct + "%";
    progressThumb.style.left = pct + "%";
    currentTimeEl.textContent = formatTime(audio.currentTime);

    // Show "0:30" as capped duration on display
    durationEl.textContent = `0:30 ★`;

    // Warning pulse at 25s
    if (audio.currentTime >= 25 && !previewWarned) {
      previewWarned = true;
      miniAddBtn.style.animation = "pulse 0.6s ease 3";
      miniAddBtn.textContent = `🛒 BUY BEFORE IT STOPS`;
      miniAddBtn.style.background = "linear-gradient(135deg,#dc2626,#ef4444)";
    }

    // Enforce 30s limit
    checkPreviewLimit();
  }

  function updatePlayButtons(playing) {
    playPauseIcon.innerHTML = playing
      ? `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
           <rect x="6" y="4" width="4" height="16" rx="1"/>
           <rect x="14" y="4" width="4" height="16" rx="1"/>
         </svg>`
      : `<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
           <path d="M8 5v14l11-7z"/>
         </svg>`;

    document.querySelectorAll(".beat-play-btn").forEach((btn) => {
      const card   = btn.closest(".beat-card, .beat-row");
      const beatId = card?.dataset?.id;
      const icon   = btn.querySelector(".play-icon");
      if (!icon) return;
      if (beatId === String(currentBeat?.id)) {
        btn.classList.add("active");
        icon.innerHTML = playing
          ? `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
               <rect x="6" y="4" width="4" height="16" rx="1"/>
               <rect x="14" y="4" width="4" height="16" rx="1"/>
             </svg>`
          : `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
               <path d="M8 5v14l11-7z"/>
             </svg>`;
      } else {
        btn.classList.remove("active");
        icon.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                            <path d="M8 5v14l11-7z"/>
                          </svg>`;
      }
    });
  }

  let currentBeatRef = null; // for replay button reference

  function loadBeat(beat, beats) {
    // Toggle play/pause if same beat
    if (currentBeat && currentBeat.id === beat.id) {
      togglePlay();
      return;
    }

    // ── Real audio URL from Supabase Storage ──────────────────────────
    const audioSrc = beat.audio || beat.audio_url || null;
    if (!audioSrc) {
      alert(`"${beat.title}" has no audio file yet.`);
      return;
    }

    currentBeat    = beat;
    currentBeatRef = beat;
    queue          = beats || [];
    queueIndex     = queue.findIndex((b) => b.id === beat.id);
    previewWarned  = false;

    audio.src = audioSrc;
    audio.load();

    // Reset mini player UI
    miniCover.src            = beat.cover || beat.cover_url || "";
    miniCover.alt            = beat.title;
    miniTitle.textContent    = beat.title;
    miniProducer.textContent = `Prod. by ${beat.producer || beat.producerName || ""}`;
    miniAddBtn.textContent   = `+ ADD $${parseFloat(beat.price || 0).toFixed(2)}`;
    miniAddBtn.style.background = "";
    miniAddBtn.style.animation  = "";
    miniAddBtn.onclick = () => Cart.openLicenseModal(beat);
    miniPlayer.classList.add("visible");

    audio.play().then(() => {
      isPlaying = true;
      updatePlayButtons(true);
      animateWaveform(true);
    }).catch((err) => {
      console.warn("Playback blocked or failed:", err);
      isPlaying = false;
      updatePlayButtons(false);
    });
  }

  function togglePlay() {
    if (!currentBeat) return;
    if (isPlaying) {
      audio.pause();
      isPlaying = false;
      updatePlayButtons(false);
      animateWaveform(false);
    } else {
      // Don't resume past 30s
      if (audio.currentTime >= PREVIEW_LIMIT) {
        audio.currentTime = 0;
        previewWarned = false;
        miniAddBtn.textContent = `+ ADD $${parseFloat(currentBeat.price || 0).toFixed(2)}`;
        miniAddBtn.style.background = "";
      }
      audio.play().catch(() => {});
      isPlaying = true;
      updatePlayButtons(true);
      animateWaveform(true);
    }
  }

  function playNext() {
    if (queue.length === 0) return;
    queueIndex = (queueIndex + 1) % queue.length;
    loadBeat(queue[queueIndex], queue);
  }

  function playPrev() {
    if (queue.length === 0) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    queueIndex = (queueIndex - 1 + queue.length) % queue.length;
    loadBeat(queue[queueIndex], queue);
  }

  function animateWaveform(active) {
    if (!miniWaveform) return;
    miniWaveform.classList.toggle("playing", active);
  }

  function setupProgressBar() {
    function seek(e) {
      const rect = progressBar.getBoundingClientRect();
      // Seeking is also capped to 30s range
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const targetTime = pct * PREVIEW_LIMIT;
      if (audio.duration) {
        audio.currentTime = Math.min(targetTime, PREVIEW_LIMIT);
      }
      progressFill.style.width = pct * 100 + "%";
      progressThumb.style.left = pct * 100 + "%";
    }

    progressBar.addEventListener("mousedown", (e) => { isDragging = true; seek(e); });
    document.addEventListener("mousemove",  (e) => { if (isDragging) seek(e); });
    document.addEventListener("mouseup",    ()  => { isDragging = false; });

    progressBar.addEventListener("touchstart", (e) => { isDragging = true; seek(e.touches[0]); }, { passive: true });
    document.addEventListener("touchmove",  (e) => { if (isDragging) seek(e.touches[0]); }, { passive: true });
    document.addEventListener("touchend",   ()  => { isDragging = false; });
  }

  function init() {
    playPauseBtn.addEventListener("click", togglePlay);
    document.getElementById("next-btn").addEventListener("click", playNext);
    document.getElementById("prev-btn").addEventListener("click", playPrev);

    audio.addEventListener("timeupdate",     updateProgress);
    audio.addEventListener("ended",          playNext);
    audio.addEventListener("loadedmetadata", () => {
      durationEl.textContent = "0:30 ★";
    });
    audio.addEventListener("error", (e) => {
      console.error("Audio load error:", e);
    });

    setupProgressBar();
  }

  return { init, loadBeat, togglePlay, playNext, playPrev, getCurrentBeat: () => currentBeat };
})();
