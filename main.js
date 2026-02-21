/*
 * Sticky Audio Player for Obsidian
 * Shows a fixed audio player at the bottom of the screen
 * when viewing files with audio: URL in frontmatter
 * Also highlights [Transl. ...] text in spoken lectures
 */

const { Plugin } = require('obsidian');

class StickyAudioPlayer extends Plugin {
  async onload() {
    console.log('Sticky Audio Player loaded');

    this.audioElement = null;
    this.playerContainer = null;
    this.currentFile = null;
    this.isPlaying = false;
    this.playbackSpeed = 1;

    // Create the player UI
    this.createPlayer();

    // Listen for file open events
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        this.handleFileOpen(file);
      })
    );

    // Listen for layout changes (switching between edit/preview mode)
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.highlightTranslations();
      })
    );

    // Also check current file on load
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      this.handleFileOpen(activeFile);
    }
  }

  onunload() {
    console.log('Sticky Audio Player unloaded');
    this.destroyPlayer();
  }

  createPlayer() {
    // Create container
    this.playerContainer = document.createElement('div');
    this.playerContainer.className = 'sticky-audio-container';
    this.playerContainer.style.display = 'none';

    // Create audio element
    this.audioElement = document.createElement('audio');
    this.audioElement.preload = 'metadata';

    // Build controls
    const controls = document.createElement('div');
    controls.className = 'sticky-audio-controls';

    // Skip back button (-10s)
    const skipBackBtn = document.createElement('button');
    skipBackBtn.className = 'sticky-audio-skip-btn';
    skipBackBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
      <text x="12" y="15" text-anchor="middle" fill="currentColor" stroke="none" font-size="8" font-weight="600">10</text>
    </svg>`;
    skipBackBtn.title = 'Back 10 seconds';
    skipBackBtn.onclick = () => this.skip(-10);

    // Play/pause button
    const playBtn = document.createElement('button');
    playBtn.className = 'sticky-audio-play-btn';
    playBtn.innerHTML = this.getPlayIcon();
    playBtn.onclick = () => this.togglePlay();
    this.playBtn = playBtn;

    // Skip forward button (+10s)
    const skipForwardBtn = document.createElement('button');
    skipForwardBtn.className = 'sticky-audio-skip-btn';
    skipForwardBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/>
      <text x="12" y="15" text-anchor="middle" fill="currentColor" stroke="none" font-size="8" font-weight="600">10</text>
    </svg>`;
    skipForwardBtn.title = 'Forward 10 seconds';
    skipForwardBtn.onclick = () => this.skip(10);

    // Progress section
    const progressSection = document.createElement('div');
    progressSection.className = 'sticky-audio-progress-section';

    // Title
    const title = document.createElement('div');
    title.className = 'sticky-audio-title';
    this.titleDisplay = title;

    // Progress wrapper (bar + time)
    const progressWrapper = document.createElement('div');
    progressWrapper.className = 'sticky-audio-progress-wrapper';

    // Progress bar
    const progressBar = document.createElement('div');
    progressBar.className = 'sticky-audio-progress-bar';
    const progressFill = document.createElement('div');
    progressFill.className = 'sticky-audio-progress-fill';
    progressBar.appendChild(progressFill);
    this.progressFill = progressFill;

    // Click to seek
    progressBar.onclick = (e) => {
      const rect = progressBar.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      if (this.audioElement.duration) {
        this.audioElement.currentTime = percent * this.audioElement.duration;
      }
    };

    // Time display
    const timeDisplay = document.createElement('div');
    timeDisplay.className = 'sticky-audio-time';
    timeDisplay.textContent = '0:00 / 0:00';
    this.timeDisplay = timeDisplay;

    progressWrapper.appendChild(progressBar);
    progressWrapper.appendChild(timeDisplay);
    progressSection.appendChild(title);
    progressSection.appendChild(progressWrapper);

    // Speed control
    const speedBtn = document.createElement('button');
    speedBtn.className = 'sticky-audio-speed';
    speedBtn.textContent = '1x';
    speedBtn.title = 'Playback speed';
    speedBtn.onclick = () => this.cycleSpeed();
    this.speedBtn = speedBtn;

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'sticky-audio-close';
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`;
    closeBtn.title = 'Close player';
    closeBtn.onclick = () => this.hidePlayer();

    // Assemble
    controls.appendChild(skipBackBtn);
    controls.appendChild(playBtn);
    controls.appendChild(skipForwardBtn);
    controls.appendChild(progressSection);
    controls.appendChild(speedBtn);
    controls.appendChild(closeBtn);

    this.playerContainer.appendChild(this.audioElement);
    this.playerContainer.appendChild(controls);

    // Audio event listeners
    this.audioElement.addEventListener('timeupdate', () => this.updateProgress());
    this.audioElement.addEventListener('loadedmetadata', () => this.updateProgress());
    this.audioElement.addEventListener('play', () => {
      this.isPlaying = true;
      this.playBtn.innerHTML = this.getPauseIcon();
    });
    this.audioElement.addEventListener('pause', () => {
      this.isPlaying = false;
      this.playBtn.innerHTML = this.getPlayIcon();
    });
    this.audioElement.addEventListener('ended', () => {
      this.isPlaying = false;
      this.playBtn.innerHTML = this.getPlayIcon();
    });

    // Add to document
    document.body.appendChild(this.playerContainer);
  }

  destroyPlayer() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
    }
    if (this.playerContainer) {
      this.playerContainer.remove();
    }
    document.body.classList.remove('sticky-audio-active');
  }

  async handleFileOpen(file) {
    if (!file) {
      return;
    }

    // Get frontmatter
    const cache = this.app.metadataCache.getFileCache(file);
    const audioUrl = cache?.frontmatter?.audio;

    if (audioUrl) {
      // Clean the URL (remove quotes if present)
      const cleanUrl = audioUrl.replace(/^["']|["']$/g, '');

      // Only reload if it's a different file
      if (this.currentFile !== file.path) {
        this.currentFile = file.path;
        this.audioElement.src = cleanUrl;
        this.titleDisplay.textContent = file.basename;

        // Reset progress display
        this.timeDisplay.textContent = '0:00 / 0:00';
        this.progressFill.style.width = '0%';
      }

      this.showPlayer();
    } else {
      // No audio in this file - hide player but don't stop if playing
      // User might be checking another file while listening
    }

    // Highlight translations after a short delay to ensure content is rendered
    setTimeout(() => this.highlightTranslations(), 100);
    setTimeout(() => this.highlightTranslations(), 500);
  }

  showPlayer() {
    this.playerContainer.style.display = 'block';
    document.body.classList.add('sticky-audio-active');
  }

  hidePlayer() {
    this.audioElement.pause();
    this.playerContainer.style.display = 'none';
    document.body.classList.remove('sticky-audio-active');
    this.currentFile = null;
  }

  togglePlay() {
    if (this.audioElement.paused) {
      this.audioElement.play();
    } else {
      this.audioElement.pause();
    }
  }

  skip(seconds) {
    if (this.audioElement.duration) {
      this.audioElement.currentTime = Math.max(0,
        Math.min(this.audioElement.duration, this.audioElement.currentTime + seconds)
      );
    }
  }

  cycleSpeed() {
    const speeds = [0.75, 1, 1.25, 1.5, 1.75, 2];
    const currentIndex = speeds.indexOf(this.playbackSpeed);
    const nextIndex = (currentIndex + 1) % speeds.length;
    this.playbackSpeed = speeds[nextIndex];
    this.audioElement.playbackRate = this.playbackSpeed;
    this.speedBtn.textContent = this.playbackSpeed + 'x';
  }

  updateProgress() {
    const current = this.audioElement.currentTime || 0;
    const duration = this.audioElement.duration || 0;

    if (duration > 0) {
      const percent = (current / duration) * 100;
      this.progressFill.style.width = percent + '%';
    }

    this.timeDisplay.textContent = `${this.formatTime(current)} / ${this.formatTime(duration)}`;
  }

  formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  getPlayIcon() {
    return `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
  }

  getPauseIcon() {
    return `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  }

  // Highlight [Transl. ...] text in reading view
  highlightTranslations() {
    // Find reading view containers
    const containers = document.querySelectorAll('.markdown-reading-view, .markdown-preview-view');

    containers.forEach(container => {
      // Find all paragraph elements
      const paragraphs = container.querySelectorAll('p');

      paragraphs.forEach(para => {
        // Skip if already processed
        if (para.hasAttribute('data-transl-processed')) return;

        const html = para.innerHTML;

        // Check if contains [Transl.
        if (!html.includes('[Transl.')) return;

        // Mark as processed
        para.setAttribute('data-transl-processed', 'true');

        // Replace [Transl. ... ] with highlighted version
        // Handle nested brackets like [Transl. text [explanation] more text]
        const highlighted = html.replace(
          /\[(Transl\.(?:[^\[\]]|\[[^\]]*\])*)\]/g,
          '[<span class="spoken-translation">$1</span>]'
        );

        para.innerHTML = highlighted;
      });
    });
  }
}

module.exports = StickyAudioPlayer;
