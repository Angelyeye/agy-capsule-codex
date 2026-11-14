// Deck injector: mounts a compact metrics strip into the Antigravity composer
// footer (next to the model selector) via the local DevTools (CDP) endpoint.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const INTERVAL_MS = 1000;
const INSTANCE_TS = Date.now();
const PORT_FILE =
  process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support', 'Antigravity', 'DevToolsActivePort')
    : process.platform === 'win32'
      ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Antigravity', 'DevToolsActivePort')
      : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'Antigravity', 'DevToolsActivePort');

const sockets = new Map(); // targetId -> { ws, pending: Map, nextId }
let lastErr = '';

function logOnce(msg) {
  if (msg !== lastErr) {
    lastErr = msg;
    console.error('[deck]', msg);
  }
}

function readCdpPort() {
  try {
    return readFileSync(PORT_FILE, 'utf-8').split('\n')[0].trim();
  } catch {
    return '';
  }
}

async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  const entry = { ws, pending: new Map(), nextId: 1 };
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('ws timeout')), 3000);
    ws.onopen = () => {
      clearTimeout(t);
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(t);
      reject(new Error('ws error'));
    };
  });
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      const cb = entry.pending.get(msg.id);
      if (cb) {
        entry.pending.delete(msg.id);
        cb(msg);
      }
    } catch {}
  };
  ws.onclose = () => sockets.delete(target.id);
  sockets.set(target.id, entry);
  return entry;
}

function evaluate(entry, expression) {
  return new Promise((resolve) => {
    const id = entry.nextId++;
    const t = setTimeout(() => {
      entry.pending.delete(id);
      resolve(undefined);
    }, 3000);
    entry.pending.set(id, (msg) => {
      clearTimeout(t);
      resolve(msg?.result?.result?.value);
    });
    entry.ws.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true },
      })
    );
  });
}

// Self-contained function executed inside the Antigravity renderer page.
function pageMount(d) {
  if (window.__deckOwnerTs && d.instanceTs && d.instanceTs < window.__deckOwnerTs) {
    return 'superseded';
  }
  if (d.instanceTs) {
    window.__deckOwnerTs = d.instanceTs;
  }
  const footerLeft = document.querySelector('.agy-composer-footer > div:first-child');
  if (!footerLeft) return 'no-footer';

  let root = document.getElementById('deck-metrics-strip');
  if (!root) {
    root = document.createElement('div');
    root.id = 'deck-metrics-strip';
  }

  // Upgrade or initialize DOM structure in-place
  if (root.getAttribute('data-deck-ver') !== '26') {
    root.setAttribute('data-deck-ver', '26');
    root.style.cssText = [
      'display: inline-flex',
      'align-items: center',
      'gap: 0px',
      'margin-left: 6px',
      'font-size: 12.5px',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      'color: var(--secondary-foreground, var(--foreground, #3f3f46))',
      'user-select: none',
      'position: relative',
      '-webkit-font-smoothing: antialiased',
    ].join(';');

    root.innerHTML = `
      <style>
        #deck-metrics-strip .dk-grp {
          display: inline-flex;
          align-items: center;
          position: relative;
        }
        #deck-metrics-strip .dk-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 5px;
          border-radius: 6px;
          cursor: default;
          position: relative;
          background: transparent;
          border: none;
          white-space: nowrap;
          transition: background 0.12s ease, color 0.12s ease;
        }
        #deck-metrics-strip .dk-grp:hover .dk-pill {
          background: var(--secondary, rgba(128, 128, 128, 0.12));
          color: var(--foreground, #0a0a0c);
        }
        #deck-metrics-strip .dk-grp:hover .dk-val,
        #deck-metrics-strip .dk-grp:hover .dk-svg {
          color: var(--foreground, #0a0a0c);
        }
        #deck-metrics-strip .dk-pill-quota {
          gap: 10px;
        }
        #deck-metrics-strip .dk-q-pair {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        #deck-metrics-strip .dk-svg {
          width: 13px;
          height: 13px;
          color: var(--muted-foreground, rgba(142, 142, 147, 0.85));
          flex-shrink: 0;
          transition: color 0.12s ease;
        }
        #deck-metrics-strip .dk-val {
          font-weight: 500;
          color: var(--muted-foreground, #71717a);
          font-variant-numeric: tabular-nums;
          transition: color 0.12s ease;
        }
        #deck-metrics-strip .dk-pop {
          display: none;
          position: absolute;
          bottom: calc(100% + 8px);
          left: 0;
          background: var(--card, rgba(20, 20, 22, 0.97));
          backdrop-filter: blur(22px);
          border: 1px solid var(--border, rgba(128, 128, 128, 0.18));
          border-radius: 10px;
          padding: 10px 12px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22), 0 2px 8px rgba(0, 0, 0, 0.08);
          z-index: 999999;
          color: var(--muted-foreground, #8e8e93);
          font-size: 13.5px;
          line-height: 1.35;
          pointer-events: none;
        }
        #deck-metrics-strip .dk-grp:hover .dk-pop {
          display: block;
        }
        /* Context Popover (matches plugin UI) */
        #deck-metrics-strip .dk-ctx-pop {
          width: max-content;
          min-width: 176px;
        }
        #deck-metrics-strip .dk-summary-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 6px;
        }
        #deck-metrics-strip .dk-used-pct {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--foreground, #18181b);
          color: color-mix(in srgb, var(--foreground, #18181b) 88%, transparent);
        }
        #deck-metrics-strip .dk-used-frac {
          font-size: 13.5px;
          color: var(--muted-foreground, #8e8e93);
          font-variant-numeric: tabular-nums;
        }
        #deck-metrics-strip .dk-track {
          position: relative;
          width: 100%;
          height: 4px;
          background: rgba(142, 142, 147, 0.24);
          border-radius: 999px;
          display: flex;
          gap: 1.5px;
          overflow: hidden;
          margin-bottom: 10px;
        }
        #deck-metrics-strip .dk-seg {
          height: 100%;
          border-radius: 999px;
          transition: width 0.25s ease;
        }
        #deck-metrics-strip .dk-tick {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 1.5px;
          background: var(--foreground, #18181b);
          opacity: 0.45;
          pointer-events: none;
        }
        #deck-metrics-strip .dk-list {
          display: grid;
          grid-template-columns: 1fr auto minmax(44px, auto);
          row-gap: 6px;
          column-gap: 8px;
          align-items: center;
        }
        #deck-metrics-strip .dk-item-row {
          display: contents;
        }
        #deck-metrics-strip .dk-item-left {
          display: flex;
          align-items: center;
          gap: 7px;
          color: var(--muted-foreground, #8e8e93);
          white-space: nowrap;
        }
        #deck-metrics-strip .dk-dot {
          width: 10px;
          height: 10px;
          border-radius: 3px;
          flex-shrink: 0;
        }
        #deck-metrics-strip .dk-item-pct {
          text-align: right;
          justify-self: end;
          color: var(--muted-foreground, #8e8e93);
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          font-size: 13.5px;
          margin-right: 6px;
        }
        #deck-metrics-strip .dk-item-k {
          text-align: right;
          justify-self: end;
          color: var(--muted-foreground, #8e8e93);
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
          font-size: 13.5px;
        }
        /* Quota Popover (matches plugin UI) */
        #deck-metrics-strip .dk-quota-pop {
          width: max-content;
        }
        #deck-metrics-strip .dk-q-group {
          margin-bottom: 8px;
        }
        #deck-metrics-strip .dk-q-group:last-child {
          margin-bottom: 0;
        }
        #deck-metrics-strip .dk-q-title {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--foreground, #18181b);
          color: color-mix(in srgb, var(--foreground, #18181b) 88%, transparent);
          margin-bottom: 3px;
        }
        #deck-metrics-strip .dk-q-row {
          display: grid;
          grid-template-columns: 54px 50px 48px;
          align-items: center;
          column-gap: 8px;
          font-size: 13.5px;
          font-variant-numeric: tabular-nums;
          margin-bottom: 3px;
        }
        #deck-metrics-strip .dk-q-row:last-child {
          margin-bottom: 0;
        }
        #deck-metrics-strip .dk-q-label {
          color: var(--muted-foreground, #8e8e93);
          white-space: nowrap;
        }
        #deck-metrics-strip .dk-q-mid {
          text-align: left;
          color: var(--muted-foreground, #8e8e93);
          white-space: nowrap;
        }
        #deck-metrics-strip .dk-q-right {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 5px;
          color: var(--muted-foreground, #8e8e93);
          white-space: nowrap;
        }
      </style>

      <!-- Context Capsule + Popover -->
      <div class="dk-grp">
        <div class="dk-pill">
          <svg class="dk-svg" data-el="ctxIconSvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>
          <span class="dk-val" data-k="pillCtx">--%</span>
        </div>
        <div class="dk-pop dk-ctx-pop">
          <div class="dk-summary-row">
            <div class="dk-used-pct" data-k="usedPctText">0% used</div>
            <div class="dk-used-frac" data-k="usedFrac">0 / 256k</div>
          </div>
          <div class="dk-track">
            <div class="dk-seg" data-el="segTurn0" style="width: 0%; background: #d4940a"></div>
            <div class="dk-seg" data-el="segRead" style="width: 0%; background: #388bfd"></div>
            <div class="dk-seg" data-el="segThink" style="width: 0%; background: #00b386"></div>
            <div class="dk-seg" data-el="segOut" style="width: 0%; background: #e86a24"></div>
            <div class="dk-tick" data-el="compactTick" style="display: none"></div>
          </div>
          <div class="dk-list">
            <div class="dk-item-row" data-el="rowCacheHit">
              <div class="dk-item-left"><span class="dk-dot" data-el="dotCached" style="display:inline-flex;align-items:center;justify-content:center;background:transparent"></span><span>Cache</span></div>
              <div class="dk-item-pct" data-k="valCacheHit" data-el="valCacheHitEl">0%</div>
              <div class="dk-item-k" data-k="valCacheHitK"></div>
            </div>
            <div class="dk-item-row">
              <div class="dk-item-left"><span class="dk-dot" style="background:#d4940a"></span><span>Turn0</span></div>
              <div class="dk-item-pct" data-k="valTurn0Pct">0%</div>
              <div class="dk-item-k" data-k="valTurn0K">0.0k</div>
            </div>
            <div class="dk-item-row">
              <div class="dk-item-left"><span class="dk-dot" style="background:#388bfd"></span><span>Read</span></div>
              <div class="dk-item-pct" data-k="valReadPct">0%</div>
              <div class="dk-item-k" data-k="valReadK">0.0k</div>
            </div>
            <div class="dk-item-row">
              <div class="dk-item-left"><span class="dk-dot" style="background:#00b386"></span><span>Think</span></div>
              <div class="dk-item-pct" data-k="valThinkPct">0%</div>
              <div class="dk-item-k" data-k="valThinkK">0.0k</div>
            </div>
            <div class="dk-item-row">
              <div class="dk-item-left"><span class="dk-dot" style="background:#e86a24"></span><span>Write</span></div>
              <div class="dk-item-pct" data-k="valOutPct">0%</div>
              <div class="dk-item-k" data-k="valOutK">0.0k</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Merged Quota Capsule (5h + Weekly) + Popover -->
      <div class="dk-grp">
        <div class="dk-pill dk-pill-quota">
          <span class="dk-q-pair">
            <svg class="dk-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>
            <span class="dk-val" data-k="pill5h">--%</span>
          </span>
          <span class="dk-q-pair">
            <svg class="dk-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span class="dk-val" data-k="pillWk">--%</span>
          </span>
        </div>
        <div class="dk-pop dk-quota-pop" data-el="quotaPop"></div>
      </div>
    `;
  }

  if (!footerLeft.contains(root)) {
    footerLeft.appendChild(root);
  }

  const setK = (k, val) => {
    const el = root.querySelector(`[data-k="${k}"]`);
    if (el && el.textContent !== val) el.textContent = val;
  };

  setK('pillCtx', d.pillCtx);
  setK('usedPctText', d.usedPctText);
  setK('usedFrac', d.usedFrac);
  setK('valCacheHit', d.valCacheHit);
  setK('valCacheHitK', d.valCacheHitK || '');
  setK('valTurn0Pct', d.valTurn0Pct);
  setK('valTurn0K', d.valTurn0K);
  setK('valReadPct', d.valReadPct);
  setK('valReadK', d.valReadK);
  setK('valThinkPct', d.valThinkPct);
  setK('valThinkK', d.valThinkK);
  setK('valOutPct', d.valOutPct);
  setK('valOutK', d.valOutK);

  // Match active model to quota pills
  root._deckQuotas = d;
  const applyModelQuota = () => {
    let mt = '';
    for (const child of footerLeft.children) {
      if (child.id !== 'deck-metrics-strip' && child.textContent) {
        mt += ' ' + child.textContent.trim();
      }
    }
    mt = mt.trim().toLowerCase();
    const q = root._deckQuotas || d;
    let q5h = q.gemini5h || '--%';
    let qWk = q.geminiWk || '--%';

    if (mt.includes('claude') || mt.includes('gpt') || mt.includes('sonnet') || mt.includes('opus')) {
      q5h = q.claude5h || '--%';
      qWk = q.claudeWk || '--%';
    } else if (mt.includes('argon')) {
      q5h = q.argon5h || '--%';
      qWk = q.argonWk || '--%';
    }
    setK('pill5h', q5h);
    setK('pillWk', qWk);
    return mt;
  };
  const modelText = applyModelQuota();

  if (!root._modelObserverAttached) {
    root._modelObserverAttached = true;
    const obs = new MutationObserver(() => applyModelQuota());
    obs.observe(footerLeft, { subtree: true, characterData: true, childList: true });
  }

  // Update progress bar & cache cooling indicator
  const segRead = root.querySelector('[data-el="segRead"]');
  const segOut = root.querySelector('[data-el="segOut"]');
  const segThink = root.querySelector('[data-el="segThink"]');
  const segTurn0 = root.querySelector('[data-el="segTurn0"]');
  const dotCached = root.querySelector('[data-el="dotCached"]');
  const compactTick = root.querySelector('[data-el="compactTick"]');
  const ctxIconSvg = root.querySelector('[data-el="ctxIconSvg"]');

  if (segRead) segRead.style.width = d.segReadW;
  if (segOut) segOut.style.width = d.segOutW;
  if (segThink) segThink.style.width = d.segThinkW;
  if (segTurn0) segTurn0.style.width = d.segTurn0W;
  if (ctxIconSvg) ctxIconSvg.style.color = d.ctxIconColor || '';
  if (dotCached && dotCached.innerHTML !== d.cacheIconSvg) {
    dotCached.innerHTML = d.cacheIconSvg;
  }
  const valCacheHitEl = root.querySelector('[data-el="valCacheHitEl"]');
  if (valCacheHitEl) {
    valCacheHitEl.style.color = d.cacheValColor;
    valCacheHitEl.style.textDecoration = d.cacheValDeco;
    valCacheHitEl.style.opacity = d.cacheValOp;
  }
  const valCacheHitKEl = root.querySelector('[data-k="valCacheHitK"]');
  if (valCacheHitKEl) {
    valCacheHitKEl.style.color = d.cacheValColor;
  }
  if (compactTick) {
    compactTick.style.display = d.tickDisplay;
    compactTick.style.left = d.tickLeft;
  }

  // Update Quota Popover HTML
  const quotaPop = root.querySelector('[data-el="quotaPop"]');
  if (quotaPop && quotaPop.innerHTML !== d.quotaHtml) {
    quotaPop.innerHTML = d.quotaHtml;
  }

  return 'ok:' + modelText;
}

function fmtK(n) {
  const num = Number(n || 0);
  if (num < 1000) return String(num);
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
}

function fmtColK(n) {
  const num = Number(n || 0);
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  return (num / 1000).toFixed(1) + 'k';
}

function formatResetShort(isoStr) {
  if (!isoStr) return '';
  const diffMs = new Date(isoStr).getTime() - Date.now();
  if (diffMs <= 0) return 'soon';
  const totalMin = Math.floor(diffMs / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return d + 'd ' + String(h).padStart(2, '0') + 'h';
  if (h > 0) return h + 'h ' + String(m).padStart(2, '0') + 'm';
  return String(Math.max(1, m)).padStart(2, '0') + 'm';
}

function makeRingSvg(frac) {
  const clamped = Math.max(0, Math.min(1, Number(frac || 0)));
  const r = 6.5;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped);
  const color = clamped <= 0.1 ? '#ef4444' : clamped <= 0.25 ? '#f59e0b' : '#4ea84e';
  return (
    '<svg width="16" height="16" viewBox="0 0 18 18" style="transform: rotate(-90deg); flex-shrink: 0;">' +
    '<circle cx="9" cy="9" r="' + r + '" fill="none" stroke="rgba(142,142,147,0.28)" stroke-width="2.2"/>' +
    '<circle cx="9" cy="9" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linecap="round" ' +
    'stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '"/>' +
    '</svg>'
  );
}

function formatGroupTitle(raw) {
  const s = String(raw || '').trim();
  if (s === 'Gemini Models') return 'Gemini';
  if (s.toLowerCase().startsWith('claude')) return 'Claude';
  return s;
}

function toView(d) {
  const maxCtx = d.maxContextTokens || 256000;
  const ctx = d.contextTokens || 0;
  const cached = d.cachedIn || 0;
  const out = d.totalOutputTokens || 0;
  const think = d.totalThinkingTokens || 0;
  const turn0 = d.turn0Tokens || 0;
  const read = Math.max(0, ctx - turn0 - out - think);

  const usedPctRound = maxCtx > 0 ? Math.round((ctx / maxCtx) * 100) : 0;
  const usedPctExact = maxCtx > 0 ? Math.min(100, (ctx / maxCtx) * 100) : 0;
  const compSum = read + out + think + turn0;
  const scale = compSum > 0 ? usedPctExact / compSum : 0;

  const segReadW = (read * scale).toFixed(2) + '%';
  const segOutW = (out * scale).toFixed(2) + '%';
  const segThinkW = (think * scale).toFixed(2) + '%';
  const segTurn0W = (turn0 * scale).toFixed(2) + '%';

  const readPct = maxCtx > 0 ? Math.round((read / maxCtx) * 100) : 0;
  const outPct = maxCtx > 0 ? Math.round((out / maxCtx) * 100) : 0;
  const thinkPct = maxCtx > 0 ? Math.round((think / maxCtx) * 100) : 0;
  const turn0Pct = maxCtx > 0 ? Math.round((turn0 / maxCtx) * 100) : 0;
  const cacheHitPct = ctx > 0 ? Math.round((cached / ctx) * 100) : 0;

  const compactThr = d.compactThresholdTokens || 0;

  const idleSec = ctx > 0 && d.lastStepEpochMs ? Math.max(0, Math.floor((Date.now() - d.lastStepEpochMs) / 1000)) : 0;
  let cacheIconSvg =
    '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="rgba(142,142,147,0.85)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 6.5 4.8 9.2 10 3"/></svg>';
  let cacheValColor = 'var(--muted-foreground, #8e8e93)';
  let cacheValDeco = 'none';
  let cacheValOp = '1';
  let valCacheHit = cacheHitPct + '%';
  let valCacheHitK = '';
  let ctxIconColor = '';

  if (idleSec >= 240) {
    cacheIconSvg =
      '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#e06c75" stroke-width="2" stroke-linecap="round"><line x1="2.2" y1="2.2" x2="9.8" y2="9.8"/><line x1="9.8" y1="2.2" x2="2.2" y2="9.8"/></svg>';
    cacheValDeco = 'line-through';
    cacheValOp = '0.5';
    ctxIconColor = 'rgba(208, 122, 128, 0.88)';
  } else if (idleSec >= 180) {
    const remMin = Math.max(1, Math.ceil((240 - idleSec) / 60));
    cacheIconSvg =
      '<svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#d4940a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="4.8"/><polyline points="6 3.5 6 6 7.8 7.2"/></svg>';
    cacheValColor = '#d4940a';
    valCacheHitK = '~' + remMin + 'm';
    ctxIconColor = 'rgba(206, 168, 92, 0.88)';
  }

  let gemini5h = '--%', geminiWk = '--%';
  let gemini5hNum = 0, geminiWkNum = 0;
  let claude5h = '--%', claudeWk = '--%';
  let argon5h = '--%', argonWk = '--%';

  let quotaHtml = '';
  for (const g of d.quotaGroups || []) {
    const title = formatGroupTitle(g.displayName);
    quotaHtml += '<div class="dk-q-group">';
    quotaHtml += '<div class="dk-q-title">' + title + '</div>';
    for (const b of g.buckets || []) {
      const baseLabel =
        b.window === 'weekly'
          ? 'Weekly'
          : b.window === '5h'
            ? '5 Hours'
            : String(b.displayName || b.window || '')
                .replace(/\s*limit\b/gi, '')
                .replace(/\b5h(?:ours)?\b/gi, '5 Hours')
                .trim();
      const resetShort = formatResetShort(b.resetTime);
      const pctLeft = Math.round((b.remainingFraction || 0) * 100);
      const pctStr = pctLeft + '%';

      if (title === 'Gemini') {
        if (b.window === '5h') {
          gemini5h = pctStr;
          gemini5hNum = pctLeft;
        }
        if (b.window === 'weekly') {
          geminiWk = pctStr;
          geminiWkNum = pctLeft;
        }
      } else if (title === 'Claude') {
        if (b.window === '5h') claude5h = pctStr;
        if (b.window === 'weekly') claudeWk = pctStr;
      } else if (title.toLowerCase().includes('argon')) {
        if (b.window === '5h') argon5h = pctStr;
        if (b.window === 'weekly') argonWk = pctStr;
      }

      quotaHtml += '<div class="dk-q-row">';
      quotaHtml += '  <span class="dk-q-label">' + baseLabel + '</span>';
      quotaHtml += '  <span class="dk-q-right"><span>' + pctLeft + '%</span>' + makeRingSvg(b.remainingFraction) + '</span>';
      quotaHtml += '  <span class="dk-q-mid">' + resetShort + '</span>';
      quotaHtml += '</div>';
    }
    quotaHtml += '</div>';
  }

  return {
    pillCtx: usedPctRound + '%',
    ctxIconColor,
    usedPctText: usedPctRound + '% used',
    usedFrac: fmtK(ctx) + ' / ' + fmtK(maxCtx),
    segReadW,
    segOutW,
    segThinkW,
    segTurn0W,
    cacheIconSvg,
    cacheValColor,
    cacheValDeco,
    cacheValOp,
    tickDisplay: compactThr > 0 && maxCtx > 0 ? 'block' : 'none',
    tickLeft: compactThr > 0 && maxCtx > 0 ? ((compactThr / maxCtx) * 100).toFixed(2) + '%' : '0%',
    valCacheHit,
    valCacheHitK,
    valTurn0Pct: turn0Pct + '%',
    valTurn0K: fmtColK(turn0),
    valReadPct: readPct + '%',
    valReadK: fmtColK(read),
    valThinkPct: thinkPct + '%',
    valThinkK: fmtColK(think),
    valOutPct: outPct + '%',
    valOutK: fmtColK(out),
    valRead: readPct + '% · ' + fmtK(read),
    valOut: outPct + '% · ' + fmtK(out),
    valThink: thinkPct + '% · ' + fmtK(think),
    valTurn0: turn0Pct + '% · ' + fmtK(turn0),
    gemini5h,
    geminiWk,
    gemini5hNum,
    geminiWkNum,
    claude5h,
    claudeWk,
    argon5h,
    argonWk,
    quotaHtml,
    instanceTs: INSTANCE_TS,
  };
}

async function tick(inspect) {
  const port = readCdpPort();
  if (!port) return logOnce('DevToolsActivePort not found');
  let targets;
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  } catch (e) {
    return logOnce('CDP list failed: ' + e.message);
  }
  const pages = targets.filter(
    (t) => t.type === 'page' && /^https?:\/\/127\.0\.0\.1/.test(t.url || '') && t.webSocketDebuggerUrl
  );
  for (const t of pages) {
    try {
      const entry = sockets.get(t.id) || (await connect(t));
      const path = (await evaluate(entry, 'location.pathname')) || '';
      const m = path.match(/\/c\/([0-9a-f-]{36})/);
      const data = await inspect(m ? m[1] : '', true);
      if (data?.error) continue;
      const res = await evaluate(entry, `(${pageMount.toString()})(${JSON.stringify(toView(data))})`);
      if (res === 'superseded') {
        process.exit(0);
      }
      if (res && res.startsWith('ok')) lastErr = '';
    } catch (e) {
      sockets.delete(t.id);
      logOnce('page ' + t.id + ': ' + e.message);
    }
  }
}

export function startDeckInjector(inspect) {
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await tick(inspect);
    } finally {
      busy = false;
    }
  }, INTERVAL_MS);
  console.log('[deck] injector started, port file:', PORT_FILE);
}
