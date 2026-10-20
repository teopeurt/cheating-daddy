import { html, css, LitElement } from '../../assets/lit-core-2.7.4.min.js';
import { unifiedPageStyles } from './sharedPageStyles.js';
import { loadScript, flatTimeline, formatClock, DEFAULT_WPM } from '../../utils/scriptTimeline.js';

const STORAGE_KEY = 'cheatingDaddy.script';
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const FONT_SCALES = [0.8, 1, 1.25, 1.5, 1.75, 2];
const TICK_MS = 200;
const DASH = '—';

// Playback lives at module level so it survives switching between the
// 'script' (loader) and 'script-player' (on-screen) views, which remount
// the element.
const session = {
    name: '',
    text: '',
    wpm: DEFAULT_WPM,
    fontScale: 1,
    speed: 1,
    parsed: null,
    flat: [],
    time: 0,
    playing: false,
    lastStamp: 0,
};

function readSaved() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (saved && typeof saved.text === 'string') {
            session.name = typeof saved.name === 'string' ? saved.name : '';
            session.text = saved.text;
            if (Number(saved.wpm) > 0) session.wpm = Number(saved.wpm);
            if (FONT_SCALES.includes(Number(saved.fontScale))) session.fontScale = Number(saved.fontScale);
        }
    } catch (e) {
        // storage unavailable or corrupt; start empty
    }
}

function writeSaved() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: session.name, text: session.text, wpm: session.wpm, fontScale: session.fontScale }));
    } catch (e) {
        // ignore quota/storage errors; the script still plays this session
    }
}

function applyText(name, text) {
    session.name = name;
    session.text = text;
    session.parsed = text.trim() ? loadScript(text, { wpm: session.wpm }) : null;
    session.flat = session.parsed ? flatTimeline(session.parsed) : [];
    session.time = 0;
    session.playing = false;
}

readSaved();
if (session.text) applyText(session.name, session.text);

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** Script text with its `backticked` file names shown as code. */
const rich = text =>
    String(text)
        .split('`')
        .map((part, i) => (i % 2 ? html`<code>${part}</code>` : part));

/** Narration in one pair of quotes, whether or not the script already quoted it. */
const quoted = text => rich(`“${String(text).replace(/^["“”]+|["“”]+$/g, '')}”`);

export class ScriptView extends LitElement {
    static styles = [
        unifiedPageStyles,
        css`
            :host {
                display: flex;
                flex-direction: column;
                height: 100%;
                min-height: 0;
            }

            /* ── Loader ── */

            .btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                background: var(--bg-elevated);
                color: var(--text-primary);
                border: 1px solid var(--border);
                border-radius: var(--radius-sm);
                padding: 6px 12px;
                font-size: var(--font-size-sm);
                cursor: pointer;
                white-space: nowrap;
                transition:
                    border-color var(--transition),
                    background var(--transition);
            }

            .btn:hover:not(:disabled) {
                border-color: var(--border-strong);
                background: var(--bg-hover);
            }

            .btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }

            .btn.primary {
                background: var(--accent);
                border-color: var(--accent);
                color: #fff;
            }

            .btn.primary:hover:not(:disabled) {
                background: var(--accent-hover);
                border-color: var(--accent-hover);
            }

            .row {
                display: flex;
                align-items: center;
                gap: var(--space-sm);
                flex-wrap: wrap;
            }

            .drop-zone {
                border: 1px dashed var(--border-strong);
                border-radius: var(--radius-md);
                padding: var(--space-lg);
                text-align: center;
                color: var(--text-secondary);
                font-size: var(--font-size-sm);
                line-height: 1.5;
                transition:
                    border-color var(--transition),
                    background var(--transition);
            }

            .drop-zone.dragging {
                border-color: var(--accent);
                background: rgba(59, 130, 246, 0.06);
            }

            .drop-zone code,
            .surface code,
            .player code {
                font-family: var(--font-mono);
                font-size: var(--font-size-xs);
                color: var(--text-primary);
            }

            textarea.control {
                min-height: 140px;
                font-family: var(--font-mono);
                font-size: var(--font-size-xs);
                user-select: text;
                cursor: text;
            }

            input[type='file'] {
                display: none;
            }

            input.control.narrow {
                width: 90px;
            }

            .stats {
                display: flex;
                gap: var(--space-sm);
                flex-wrap: wrap;
                margin-bottom: var(--space-md);
            }

            .warning {
                color: var(--warning);
                font-size: var(--font-size-xs);
                line-height: 1.4;
                margin-bottom: var(--space-sm);
            }

            .outline {
                list-style: none;
                display: flex;
                flex-direction: column;
                gap: 2px;
                margin-bottom: var(--space-md);
            }

            .outline li {
                display: flex;
                gap: var(--space-sm);
                font-size: var(--font-size-sm);
                color: var(--text-secondary);
                padding: 4px 0;
                border-bottom: 1px solid var(--border);
            }

            .outline .at {
                font-family: var(--font-mono);
                font-size: var(--font-size-xs);
                color: var(--text-muted);
                min-width: 48px;
                padding-top: 2px;
            }

            /* ── Player ── */

            .player {
                flex: 1;
                min-height: 0;
                display: flex;
                flex-direction: column;
                gap: var(--space-sm);
                padding: var(--space-sm) var(--space-md) var(--space-md);
                background: var(--bg-app);
            }

            .transport {
                display: flex;
                align-items: center;
                gap: 6px;
                flex-wrap: wrap;
            }

            .transport .btn {
                padding: 4px 10px;
                font-size: var(--font-size-xs);
            }

            .clock {
                font-family: var(--font-mono);
                font-size: var(--font-size-sm);
                color: var(--text-primary);
                margin: 0 var(--space-xs);
            }

            .clock .total {
                color: var(--text-muted);
            }

            .spacer {
                flex: 1;
            }

            select.mini {
                width: auto;
                padding: 3px 24px 3px 8px;
                font-size: var(--font-size-xs);
            }

            .seek {
                width: 100%;
                accent-color: var(--accent);
                cursor: pointer;
            }

            .scene-jump {
                display: flex;
                gap: 6px;
                overflow-x: auto;
                padding-bottom: 2px;
                flex-shrink: 0;
            }

            .scene-chip {
                flex-shrink: 0;
                border: 1px solid var(--border);
                border-radius: 999px;
                padding: 2px 10px;
                font-size: var(--font-size-xs);
                color: var(--text-secondary);
                background: none;
                cursor: pointer;
                white-space: nowrap;
            }

            .scene-chip.active {
                border-color: var(--accent);
                color: var(--text-primary);
                background: rgba(59, 130, 246, 0.12);
            }

            .now {
                flex-shrink: 0;
                border: 1px solid var(--border);
                border-left: 3px solid var(--accent);
                border-radius: var(--radius-md);
                background: var(--bg-surface);
                padding: var(--space-md);
            }

            .now-scene {
                font-size: var(--font-size-xs);
                color: var(--text-muted);
                text-transform: uppercase;
                letter-spacing: 0.04em;
                margin-bottom: 6px;
            }

            .now-action {
                font-size: calc(var(--font-size-lg) * 1.25 * var(--script-scale, 1));
                font-weight: var(--font-weight-medium);
                line-height: 1.4;
                color: var(--text-primary);
            }

            .now-narration {
                margin-top: var(--space-sm);
                font-size: calc(var(--font-size-lg) * var(--script-scale, 1));
                line-height: 1.45;
                color: #93c5fd;
                font-style: italic;
            }

            .now-next {
                margin-top: var(--space-sm);
                font-size: calc(var(--font-size-sm) * var(--script-scale, 1));
                color: var(--text-muted);
                line-height: 1.4;
            }

            .now-meta {
                margin-top: var(--space-sm);
                display: flex;
                flex-direction: column;
                gap: 2px;
                font-size: var(--font-size-xs);
                color: var(--text-secondary);
            }

            .now-meta b {
                color: var(--text-muted);
                font-weight: var(--font-weight-medium);
            }

            .beats {
                position: relative;
                flex: 1;
                min-height: 0;
                overflow-y: auto;
                list-style: none;
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .beat {
                display: flex;
                gap: var(--space-sm);
                padding: 6px var(--space-sm);
                border-radius: var(--radius-sm);
                cursor: pointer;
                opacity: 0.45;
                font-size: calc(var(--font-size-sm) * var(--script-scale, 1));
                line-height: 1.4;
                color: var(--text-secondary);
            }

            .beat:hover {
                background: var(--bg-hover);
            }

            .beat.revealed {
                opacity: 0.75;
            }

            .beat.current {
                opacity: 1;
                color: var(--text-primary);
                background: var(--bg-elevated);
                box-shadow: inset 2px 0 0 var(--accent);
            }

            .beat .at {
                font-family: var(--font-mono);
                font-size: var(--font-size-xs);
                color: var(--text-muted);
                min-width: 40px;
                padding-top: 2px;
            }

            .beat .narration {
                color: #93c5fd;
                font-style: italic;
                margin-top: 2px;
            }

            .scene-marker {
                font-size: var(--font-size-xs);
                color: var(--text-muted);
                text-transform: uppercase;
                letter-spacing: 0.04em;
                padding: var(--space-sm) var(--space-sm) 2px;
            }

            .empty {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: var(--space-md);
                color: var(--text-muted);
                font-size: var(--font-size-sm);
            }

            .hint {
                font-size: var(--font-size-xs);
                color: var(--text-muted);
            }
        `,
    ];

    static properties = {
        presenting: { type: Boolean },
        onPresent: { type: Function },
        onExit: { type: Function },
        _dragging: { state: true },
        _draft: { state: true },
        _tick: { state: true },
    };

    constructor() {
        super();
        this.presenting = false;
        this.onPresent = () => {};
        this.onExit = () => {};
        this._dragging = false;
        this._draft = '';
        this._tick = 0;
        this._interval = null;
        this._lastCurrentKey = '';
        // Shortcuts only drive the on-screen player, never the loader.
        this._onKeydown = e => this.presenting && this._handleKeydown(e);
        this._onPrevBeat = () => this.presenting && this.stepBeat(-1);
        this._onNextBeat = () => this.presenting && this.stepBeat(1);
    }

    connectedCallback() {
        super.connectedCallback();
        window.addEventListener('keydown', this._onKeydown);
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.on('navigate-previous-response', this._onPrevBeat);
            ipcRenderer.on('navigate-next-response', this._onNextBeat);
        }
        if (this.presenting && session.playing) this._startTicker();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        window.removeEventListener('keydown', this._onKeydown);
        if (window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.removeListener('navigate-previous-response', this._onPrevBeat);
            ipcRenderer.removeListener('navigate-next-response', this._onNextBeat);
        }
        this._stopTicker();
        // Leaving the on-screen player always pauses; the position is kept.
        if (this.presenting) session.playing = false;
    }

    // ── Loading ──

    _load(name, text) {
        applyText(name, text);
        writeSaved();
        this._draft = '';
        this._refresh();
    }

    async _loadFile(file) {
        if (!file) return;
        try {
            const text = await file.text();
            this._load(file.name, text);
        } catch (e) {
            console.error('Could not read script file:', e);
        }
    }

    _handleDrop(e) {
        e.preventDefault();
        this._dragging = false;
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) this._loadFile(file);
    }

    _handleWpmChange(e) {
        const wpm = Number(e.target.value);
        if (!(wpm > 0)) return;
        session.wpm = wpm;
        writeSaved();
        // Only plain scripts are timed by reading speed; a play-by-play keeps its own clock.
        if (session.parsed && session.parsed.mode === 'plain') applyText(session.name, session.text);
        this._refresh();
    }

    _clear() {
        applyText('', '');
        writeSaved();
        this._refresh();
    }

    // ── Playback ──

    get _total() {
        return session.parsed ? session.parsed.totalSeconds : 0;
    }

    _refresh() {
        this._tick++;
    }

    _startTicker() {
        this._stopTicker();
        session.lastStamp = Date.now();
        this._interval = setInterval(() => {
            const now = Date.now();
            session.time = Math.min(this._total, session.time + ((now - session.lastStamp) / 1000) * session.speed);
            session.lastStamp = now;
            if (session.time >= this._total) this.pause();
            this._refresh();
        }, TICK_MS);
    }

    _stopTicker() {
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
    }

    play() {
        if (!this._total) return;
        if (session.time >= this._total) session.time = 0;
        session.playing = true;
        this._startTicker();
        this._refresh();
    }

    pause() {
        session.playing = false;
        this._stopTicker();
        this._refresh();
    }

    togglePlay() {
        if (session.playing) this.pause();
        else this.play();
    }

    seekTo(seconds) {
        session.time = clamp(Number(seconds) || 0, 0, this._total);
        session.lastStamp = Date.now();
        this._refresh();
    }

    /** Jump to the previous/next beat on the flat timeline. */
    stepBeat(direction) {
        const flat = session.flat;
        if (!flat.length) return;
        const idx = this._currentFlatIndex();
        if (direction > 0) {
            const next = flat[idx + 1];
            if (next) this.seekTo(next.atSeconds);
        } else {
            // Like a media player: first go back to the start of the current beat.
            const cur = flat[idx];
            if (cur && session.time - cur.atSeconds > 1.5) this.seekTo(cur.atSeconds);
            else this.seekTo(idx > 0 ? flat[idx - 1].atSeconds : 0);
        }
    }

    _setSpeed(value) {
        session.speed = Number(value) || 1;
        this._refresh();
    }

    _scaleFont(direction) {
        const i = FONT_SCALES.indexOf(session.fontScale);
        session.fontScale = FONT_SCALES[clamp(i + direction, 0, FONT_SCALES.length - 1)];
        writeSaved();
        this._refresh();
    }

    _handleKeydown(e) {
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === ' ') {
            e.preventDefault();
            this.togglePlay();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (e.shiftKey) this.seekTo(session.time + 10);
            else this.stepBeat(1);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (e.shiftKey) this.seekTo(session.time - 10);
            else this.stepBeat(-1);
        } else if (e.key === 'Home') {
            e.preventDefault();
            this.seekTo(0);
        } else if (e.key === '+' || e.key === '=') {
            this._scaleFont(1);
        } else if (e.key === '-') {
            this._scaleFont(-1);
        }
    }

    // ── Position ──

    /** The last scene whose start the clock has reached. */
    _currentScene() {
        const scenes = session.parsed ? session.parsed.scenes : [];
        let cur = null;
        for (const sc of scenes) {
            if (session.time >= sc.startSeconds) cur = sc;
            else break;
        }
        return cur || scenes[0] || null;
    }

    /** Index into the flat timeline of the last beat the clock has passed, or -1. */
    _currentFlatIndex() {
        let idx = -1;
        for (let i = 0; i < session.flat.length; i++) {
            if (session.time >= session.flat[i].atSeconds) idx = i;
            else break;
        }
        return idx;
    }

    updated() {
        if (!this.presenting) return;
        const list = this.shadowRoot.querySelector('.beats');
        const current = list && list.querySelector('.beat.current');
        const key = current ? current.dataset.key : '';
        if (current && key !== this._lastCurrentKey) {
            list.scrollTo({ top: current.offsetTop - list.clientHeight / 3, behavior: 'smooth' });
        }
        this._lastCurrentKey = key;
    }

    // ── Render ──

    render() {
        return this.presenting ? this.renderPlayer() : this.renderLoader();
    }

    renderLoader() {
        const parsed = session.parsed;
        return html`
            <div class="unified-page">
                <div class="unified-wrap">
                    <div>
                        <div class="page-title">Script</div>
                        <div class="page-subtitle">
                            Load a script and play it on screen beside your work. The window stays on top and is hidden from screen capture, so it
                            works as a private teleprompter while you record.
                        </div>
                    </div>

                    <section class="surface">
                        <div class="surface-title">Load a script</div>
                        <div class="surface-subtitle">
                            A tasksbaby <code>play_by_play_*.md</code> plays on its own clock (scenes, beats and narration). Any other text plays one
                            paragraph at a time, timed by reading speed.
                        </div>
                        <div class="form-grid">
                            <div
                                class="drop-zone ${this._dragging ? 'dragging' : ''}"
                                @dragover=${e => {
                                    e.preventDefault();
                                    this._dragging = true;
                                }}
                                @dragleave=${() => (this._dragging = false)}
                                @drop=${e => this._handleDrop(e)}
                            >
                                Drop a <code>.md</code> or <code>.txt</code> script here
                                <div class="row" style="justify-content:center;margin-top:var(--space-sm)">
                                    <button class="btn" @click=${() => this.shadowRoot.querySelector('#script-file').click()}>Choose file…</button>
                                </div>
                                <input
                                    id="script-file"
                                    type="file"
                                    accept=".md,.markdown,.txt,text/markdown,text/plain"
                                    @change=${e => {
                                        this._loadFile(e.target.files[0]);
                                        e.target.value = '';
                                    }}
                                />
                            </div>
                            <textarea
                                class="control"
                                placeholder="…or paste a script here"
                                .value=${this._draft}
                                @input=${e => (this._draft = e.target.value)}
                            ></textarea>
                            <div class="row">
                                <button class="btn" ?disabled=${!this._draft.trim()} @click=${() => this._load('Pasted script', this._draft)}>
                                    Use pasted text
                                </button>
                                <span class="spacer"></span>
                                <label class="form-label" for="wpm">Reading speed (plain text)</label>
                                <input
                                    id="wpm"
                                    class="control narrow"
                                    type="number"
                                    min="60"
                                    max="400"
                                    step="10"
                                    .value=${String(session.wpm)}
                                    @change=${e => this._handleWpmChange(e)}
                                />
                                <span class="form-help">wpm</span>
                            </div>
                        </div>
                    </section>

                    ${parsed ? this.renderLoaded(parsed) : ''}
                </div>
            </div>
        `;
    }

    renderLoaded(parsed) {
        const beats = session.flat.length;
        return html`
            <section class="surface">
                <div class="surface-title">${parsed.title || session.name || 'Script'}</div>
                <div class="surface-subtitle">${session.name}</div>
                <div class="stats">
                    <span class="pill">${parsed.mode === 'timed' ? 'play-by-play' : 'plain text'}</span>
                    <span class="pill">${parsed.scenes.length} scene${parsed.scenes.length === 1 ? '' : 's'}</span>
                    <span class="pill">${beats} beat${beats === 1 ? '' : 's'}</span>
                    <span class="pill">${formatClock(parsed.totalSeconds)} total</span>
                </div>
                ${parsed.warnings.map(w => html`<div class="warning">⚠ ${w}</div>`)}
                <ol class="outline">
                    ${parsed.scenes.map(
                        sc => html`
                            <li>
                                <span class="at">${formatClock(sc.startSeconds)}</span>
                                <span
                                    >${parsed.mode === 'timed' ? `Scene ${sc.n} — ` : ''}${sc.app || DASH}${sc.contribution
                                        ? `: ${sc.contribution}`
                                        : ''}</span
                                >
                            </li>
                        `
                    )}
                </ol>
                <div class="row">
                    <button class="btn primary" ?disabled=${!this._total} @click=${() => this.onPresent()}>Show on screen</button>
                    <button class="btn" @click=${() => this._clear()}>Clear</button>
                    <span class="hint">In the player: Space play/pause · ←/→ beat · Shift+←/→ 10s · +/− text size</span>
                </div>
            </section>
        `;
    }

    renderPlayer() {
        const parsed = session.parsed;
        if (!parsed || !this._total) {
            return html`
                <div class="empty">
                    No script to play.
                    <button class="btn" @click=${() => this.onExit()}>Load a script</button>
                </div>
            `;
        }

        const t = session.time;
        const total = this._total;
        const sc = this._currentScene();
        const idx = this._currentFlatIndex();
        const beat = idx >= 0 ? session.flat[idx] : null;
        const inScene = beat && sc && beat.sceneN === sc.n;
        const next = session.flat[idx + 1];
        const timed = parsed.mode === 'timed';

        let action;
        if (inScene) action = beat.action || DASH;
        else if (sc && sc.beats.length) action = `${timed ? `Scene ${sc.n}` : sc.app} starts — first beat at ${sc.beats[0].at}.`;
        else action = 'This scene has no beats (scene-level timing only).';

        let lastScene = null;
        return html`
            <div class="player" style="--script-scale:${session.fontScale}">
                <div class="transport">
                    <button class="btn primary" @click=${() => this.togglePlay()}>${session.playing ? 'Pause' : 'Play'}</button>
                    <button class="btn" title="Previous beat (←)" @click=${() => this.stepBeat(-1)}>◀</button>
                    <button class="btn" title="Next beat (→)" @click=${() => this.stepBeat(1)}>▶</button>
                    <button class="btn" title="Back to scene start" @click=${() => this.seekTo(sc ? sc.startSeconds : 0)}>Scene start</button>
                    <span class="clock">${formatClock(t)} <span class="total">/ ${formatClock(total)}</span></span>
                    <span class="spacer"></span>
                    <select class="control mini" title="Speed" @change=${e => this._setSpeed(e.target.value)}>
                        ${SPEEDS.map(s => html`<option value=${s} ?selected=${s === session.speed}>${s}×</option>`)}
                    </select>
                    <button class="btn" title="Smaller text (−)" @click=${() => this._scaleFont(-1)}>A−</button>
                    <button class="btn" title="Larger text (+)" @click=${() => this._scaleFont(1)}>A+</button>
                </div>

                <input
                    class="seek"
                    type="range"
                    min="0"
                    max=${total}
                    step="1"
                    .value=${String(Math.floor(t))}
                    @input=${e => this.seekTo(e.target.value)}
                    aria-label="Seek within the script"
                />

                ${parsed.scenes.length > 1
                    ? html`
                          <div class="scene-jump">
                              ${parsed.scenes.map(
                                  s => html`
                                      <button class="scene-chip ${sc && s.n === sc.n ? 'active' : ''}" @click=${() => this.seekTo(s.startSeconds)}>
                                          ${formatClock(s.startSeconds)} · ${timed ? `Scene ${s.n} ` : ''}${s.app}
                                      </button>
                                  `
                              )}
                          </div>
                      `
                    : ''}

                <div class="now">
                    <div class="now-scene">
                        ${sc ? (timed ? `Scene ${sc.n} — ${sc.app || DASH}` : sc.app) : ''}${sc && sc.contribution ? ` · ${sc.contribution}` : ''}
                    </div>
                    <div class="now-action">${rich(action)}</div>
                    ${inScene && beat.narration ? html`<div class="now-narration">${quoted(beat.narration)}</div>` : ''}
                    ${next ? html`<div class="now-next">Next at ${formatClock(next.atSeconds)}: ${rich(next.action)}</div>` : ''}
                    ${sc && (sc.checkpoint || sc.evidence)
                        ? html`
                              <div class="now-meta">
                                  ${sc.checkpoint ? html`<span><b>Checkpoint:</b> ${rich(sc.checkpoint)}</span>` : ''}
                                  ${sc.evidence ? html`<span><b>Evidence:</b> ${rich(sc.evidence)}</span>` : ''}
                              </div>
                          `
                        : ''}
                </div>

                <ol class="beats">
                    ${session.flat.map((entry, i) => {
                        const marker =
                            entry.sceneN !== lastScene && parsed.scenes.length > 1
                                ? html`<li class="scene-marker">${timed ? `Scene ${entry.sceneN}` : parsed.scenes[entry.sceneN - 1].app}</li>`
                                : '';
                        lastScene = entry.sceneN;
                        return html`
                            ${marker}
                            <li
                                class="beat ${t >= entry.atSeconds ? 'revealed' : ''} ${i === idx ? 'current' : ''}"
                                data-key=${i}
                                @click=${() => this.seekTo(entry.atSeconds)}
                            >
                                <span class="at">${formatClock(entry.atSeconds)}</span>
                                <div>
                                    <div>${rich(entry.action || DASH)}</div>
                                    ${entry.narration ? html`<div class="narration">${quoted(entry.narration)}</div>` : ''}
                                </div>
                            </li>
                        `;
                    })}
                </ol>
            </div>
        `;
    }
}

customElements.define('script-view', ScriptView);
