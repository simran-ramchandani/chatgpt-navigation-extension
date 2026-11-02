(() => {
  if (window.__cgptNavigatorLoaded) return;
  window.__cgptNavigatorLoaded = true;

  const HOST_ID = 'cgpt-chat-navigator-host';
  const WORDS = 6; // how many words of each prompt to show
  const TAG = '[Chat Navigator]';

  // ---------------------------------------------------------------
  // Sidebar lives in a Shadow DOM so ChatGPT's CSS can't break it
  // and ours can't leak into the page.
  // ---------------------------------------------------------------
  const CSS = `
    :host { all: initial; }
    .panel {
      position: fixed; top: 76px; right: 14px; width: 280px; height: 72vh; max-height: 72vh;
      display: flex; flex-direction: column;
      font: 13px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: #ffffff; color: #1a1a1a;
      border: 1px solid rgba(0,0,0,.14); border-radius: 12px;
      box-shadow: 0 6px 24px rgba(0,0,0,.16);
      overflow: hidden;
    }
    .panel.dark { background: #212121; color: #ececec; border-color: rgba(255,255,255,.16); }
    .panel.collapsed { height: auto; max-height: none; }
    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 10px 10px 14px; border-bottom: 1px solid rgba(128,128,128,.28);
      cursor: grab; user-select: none; touch-action: none;
    }
    header:active { cursor: grabbing; }
    .panel.collapsed header { border-bottom: none; }
    .title { font-weight: 650; font-size: 14px; }
    .sub { font-size: 11px; opacity: .6; margin-top: 1px; }
    .header-actions { display: flex; align-items: center; gap: 4px; }
    button.top, button.toggle {
      all: unset; cursor: pointer; width: 26px; height: 26px; text-align: center;
      line-height: 26px; border-radius: 6px; font-size: 16px; opacity: .75;
    }
    button.top:hover, button.toggle:hover { background: rgba(128,128,128,.22); opacity: 1; }
    .search {
      box-sizing: border-box; width: calc(100% - 16px); margin: 8px 8px 2px;
      padding: 8px 10px; border: 1px solid rgba(128,128,128,.35);
      border-radius: 8px; outline: none; background: transparent; color: inherit;
      font: inherit;
    }
    .search::placeholder { color: inherit; opacity: .5; }
    .panel.collapsed .search, .panel.collapsed ol { display: none; }
    ol {
      list-style: none; margin: 0; padding: 6px; overflow-y: auto;
      flex: 1; min-height: 0; overscroll-behavior: contain; scrollbar-width: thin;
    }
    li {
      display: flex; gap: 8px; padding: 7px 8px; border-radius: 7px; cursor: pointer;
      border-left: 3px solid transparent;
    }
    li:hover { background: rgba(128,128,128,.18); }
    li.active { background: rgba(16,163,127,.18); border-left-color: #10a37f; }
    .num { opacity: .55; min-width: 18px; text-align: right; flex: none; }
    .txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .empty { padding: 10px 8px; opacity: .65; cursor: default; display: block; white-space: normal; }
  `;

  let host, panel, listEl, toggleBtn, searchEl, topBtn;
  let collapsed = false;

  function getConversationId() {
  const match = location.pathname.match(/\/c\/([^/]+)/);
  return match ? match[1] : location.pathname;
}

  function buildPanel() {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial; position:fixed; top:0; right:0; z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>${CSS}</style>
      <div class="panel">
        <header>
          <div><div class="title">Chat Navigator</div><div class="sub">Local only</div></div>
          <div class="header-actions">
            <button class="top" title="Go to top of conversation" aria-label="Go to top">↑</button>
            <button class="toggle" title="Collapse / expand">–</button>
          </div>
        </header>
        <input class="search" type="search" placeholder="Search your prompts…" aria-label="Search your prompts">
        <ol></ol>
      </div>`;
    panel = root.querySelector('.panel');
    listEl = root.querySelector('ol');
    toggleBtn = root.querySelector('.toggle');
    topBtn = root.querySelector('.top');
    searchEl = root.querySelector('.search');

    // Drag the navigator by its header. Buttons remain clickable and do not start a drag.
    const headerEl = root.querySelector('header');
    let dragState = null;

    headerEl.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const rect = host.getBoundingClientRect();
      dragState = {
        pointerId: e.pointerId,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top
      };
      headerEl.setPointerCapture(e.pointerId);
      host.style.left = rect.left + 'px';
      host.style.top = rect.top + 'px';
      host.style.right = 'auto';
    });

    headerEl.addEventListener('pointermove', (e) => {
      if (!dragState || e.pointerId !== dragState.pointerId) return;
      const width = host.offsetWidth;
      const height = host.offsetHeight;
      const left = Math.max(0, Math.min(window.innerWidth - width, e.clientX - dragState.offsetX));
      const top = Math.max(0, Math.min(window.innerHeight - Math.min(height, 60), e.clientY - dragState.offsetY));
      host.style.left = left + 'px';
      host.style.top = top + 'px';
    });

    const stopDragging = (e) => {
      if (!dragState || e.pointerId !== dragState.pointerId) return;
      dragState = null;
    };
    headerEl.addEventListener('pointerup', stopDragging);
    headerEl.addEventListener('pointercancel', stopDragging);

    searchEl.addEventListener('input', renderList);

    toggleBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      applyState();
    });

    topBtn.addEventListener('click', () => {
      const candidates = findUserMessages();
      const first = candidates[0];
      if (first) {
        (first.parentElement || first).scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    listEl.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-key]');
      if (!li) return;

      const item = knownItems.get(li.dataset.key);
      if (!item) return;

      // If the prompt is currently mounted, navigate directly.
      let target = item.el && item.el.isConnected ? item.el : null;
      if (!target) {
        target = findUserMessages().find(el => promptText(el) === item.fullText) || null;
        if (target) item.el = target;
      }

      if (target) {
        (target.parentElement || target).scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
        updateActive();
        return;
      }

      // The prompt is cached but ChatGPT has virtualized its DOM node.
      // Move to the relevant end of the currently mounted conversation so
      // ChatGPT can load the older/newer section containing the target.
      const targetIndex = orderedKeys.indexOf(item.key);
      const mountedIndexes = [];

      orderedKeys.forEach((key, index) => {
        const cached = knownItems.get(key);
        if (cached && cached.el && cached.el.isConnected) mountedIndexes.push(index);
      });

      let goToTop = targetIndex >= 0 &&
        mountedIndexes.length > 0 &&
        targetIndex < Math.min(...mountedIndexes);

      if (targetIndex >= 0 && mountedIndexes.length > 0 &&
          targetIndex > Math.max(...mountedIndexes)) {
        goToTop = false;
      } else if (targetIndex >= 0 && mountedIndexes.length > 0 &&
                 targetIndex >= Math.min(...mountedIndexes) &&
                 targetIndex <= Math.max(...mountedIndexes)) {
        const topDistance = Math.abs(targetIndex - Math.min(...mountedIndexes));
        const bottomDistance = Math.abs(Math.max(...mountedIndexes) - targetIndex);
        goToTop = topDistance <= bottomDistance;
      }

      const anchor = mountedIndexes.length
        ? knownItems.get(orderedKeys[mountedIndexes[0]])?.el
        : null;

      let scroller = document.scrollingElement || document.documentElement;
      if (anchor) {
        for (let node = anchor.parentElement; node && node !== document.body; node = node.parentElement) {
          const style = getComputedStyle(node);
          const canScroll = /(auto|scroll)/.test(style.overflowY) &&
            node.scrollHeight > node.clientHeight + 20;
          if (canScroll) {
            scroller = node;
            break;
          }
        }
      }

      if (scroller === document.scrollingElement || scroller === document.documentElement) {
        window.scrollTo({
          top: goToTop ? 0 : document.documentElement.scrollHeight,
          behavior: 'smooth'
        });
      } else {
        scroller.scrollTo({
          top: goToTop ? 0 : scroller.scrollHeight,
          behavior: 'smooth'
        });
      }

      li.title = goToTop
        ? 'Prompt is not currently loaded. Moving to the top of the loaded conversation.'
        : 'Prompt is not currently loaded. Moving to the bottom of the loaded conversation.';
    });

    applyState();
    attach();
  }

  function attach() {
    if (!host.isConnected) (document.body || document.documentElement).appendChild(host);
  }

  function isDark() {
    const cl = document.documentElement.classList;
    if (cl.contains('dark')) return true;
    if (cl.contains('light')) return false;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function applyState() {
    panel.classList.toggle('collapsed', collapsed);
    panel.classList.toggle('dark', isDark());
    toggleBtn.textContent = collapsed ? '+' : '–';
  }

  // ---------------------------------------------------------------
  // Finding the user's prompts. Tries stable attributes first, then
  // falls back to the conversation-turn containers.
  // ---------------------------------------------------------------
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

  function labelFrom(el) {
    let text = clean(el.innerText || el.textContent);
    text = text.replace(/^you said:?\s*/i, '');
    if (!text) return '';
    const words = text.split(' ');
    const short = words.slice(0, WORDS).join(' ');
    return words.length > WORDS ? short + '…' : short;
  }

  function findUserMessages() {
    // Current ChatGPT UI exposes an accessible "You said:" heading.
    // Its parent contains the user's prompt text.
    return [...document.querySelectorAll('h4')]
      .filter(h => {
        if (!/^You said:/i.test(clean(h.textContent))) return false;

        // ChatGPT can keep the previous conversation mounted in the page
        // while switching chats. Ignore hidden/inactive conversation DOM.
        const message = h.parentElement;
        if (!message || !clean(message.innerText).length) return false;
        if (h.getClientRects().length === 0) return false;

        for (let node = h; node && node !== document.body; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
        }
        return true;
      })
      .map(h => h.parentElement)
      .filter(el => el && clean(el.innerText).length > 0);
  }

  // ---------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------
  let items = [];
  let orderedKeys = [];
  let lastRoute = getConversationId();
  let routeChangedAt = 0;
  const knownItems = new Map();

  function promptKey(fullText) {
    return fullText;
  }

  function renderList() {
    const previousScrollTop = listEl.scrollTop;
    const query = clean(searchEl ? searchEl.value : '').toLowerCase();
    const visible = items.filter(item => !query || item.fullText.toLowerCase().includes(query));

    listEl.textContent = '';
    if (!visible.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = items.length
        ? 'No prompts match your search.'
        : 'No prompts found yet. Scroll through the conversation to collect prompts.';
      listEl.appendChild(li);
      return;
    }

    const frag = document.createDocumentFragment();
    visible.forEach((it) => {
      const li = document.createElement('li');
      li.dataset.key = it.key;
      li.title = it.fullText.slice(0, 500);

      const n = document.createElement('span');
      n.className = 'num';
      n.textContent = (items.indexOf(it) + 1) + '.';

      const t = document.createElement('span');
      t.className = 'txt';
      t.textContent = it.label;
      li.append(n, t);
      frag.appendChild(li);
    });
    listEl.appendChild(frag);
    listEl.scrollTop = previousScrollTop;
    updateActive();
  }

  function promptText(el) {
  return clean(el.innerText).replace(/^You said:\s*/i, '');
}

  function refresh() {
    attach();
    applyState();

    // A different conversation gets a fresh prompt cache.
    const currentRoute = getConversationId();

if (currentRoute !== lastRoute) {
  lastRoute = currentRoute;
  routeChangedAt = Date.now();

  // Clear the previous chat immediately.
  knownItems.clear();
  orderedKeys = [];
  items = [];

  if (searchEl) searchEl.value = '';
  renderList();
  schedule(200);
  return;
}

    // Do not collect messages during the short SPA navigation transition.
    if (Date.now() - routeChangedAt < 900) return;

    const found = findUserMessages();
    const foundKeys = [];
    
    found.forEach(el => {
      const fullText = promptText(el);
      if (!fullText || /^you$/i.test(fullText) || /^you said:?$/i.test(fullText)) return;

      const key = promptKey(fullText);
      const existing = knownItems.get(key);
      const words = fullText.split(' ');
      const label = words.slice(0, WORDS).join(' ') + (words.length > WORDS ? '…' : '');

      if (existing) {
        existing.el = el;
      } else {
        knownItems.set(key, { key, el, fullText, label });
      }
      foundKeys.push(key);
    });

    // Merge newly discovered prompts into the chronological list.
    // ChatGPT often loads older messages after newer ones while scrolling upward.
    if (!orderedKeys.length) {
      orderedKeys = [...foundKeys];
    } else {
      for (let i = 0; i < foundKeys.length; i++) {
        const key = foundKeys[i];
        if (orderedKeys.includes(key)) continue;

        let nextKnown = null;
        for (let j = i + 1; j < foundKeys.length; j++) {
          if (orderedKeys.includes(foundKeys[j])) {
            nextKnown = foundKeys[j];
            break;
          }
        }

        let prevKnown = null;
        for (let j = i - 1; j >= 0; j--) {
          if (orderedKeys.includes(foundKeys[j])) {
            prevKnown = foundKeys[j];
            break;
          }
        }

        if (nextKnown) {
          orderedKeys.splice(orderedKeys.indexOf(nextKnown), 0, key);
        } else if (prevKnown) {
          orderedKeys.splice(orderedKeys.indexOf(prevKnown) + 1, 0, key);
        } else {
          orderedKeys.unshift(key);
        }
      }

      const mounted = foundKeys.filter(key => orderedKeys.includes(key));
      if (mounted.length > 1) {
        let cursor = 0;
        orderedKeys = orderedKeys.map(key => {
          if (mounted.includes(key)) return mounted[cursor++];
          return key;
        });
      }
    }

    // Keep previously seen prompts even after ChatGPT virtualizes/unmounts them.
    items = orderedKeys.map(key => knownItems.get(key)).filter(Boolean);
    renderList();
  }

  function updateActive() {
    if (!items.length || !listEl) return;

    // Refresh element references from the live DOM. ChatGPT can unmount and
    // remount virtualized messages while the user scrolls.
    const liveMessages = findUserMessages();
    const liveByText = new Map();
    liveMessages.forEach(el => {
      const text = promptText(el);
      if (text) liveByText.set(text, el);
    });

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const candidates = [];

    for (const item of items) {
      const live = liveByText.get(item.fullText);
      if (live) item.el = live;

      const el = item.el;
      if (!el || !el.isConnected) continue;

      const rect = (el.parentElement || el).getBoundingClientRect();
      // Ignore elements outside the visible viewport, including stale
      // virtualized placeholders that remain connected to the document.
      if (rect.bottom <= 0 || rect.top >= viewportHeight) continue;

      candidates.push({ key: item.key, top: rect.top });
    }

    // Select the visible prompt nearest the reading line near the top of chat.
    // If every visible prompt starts below the reading line, select the first.
    const aboveLine = candidates.filter(x => x.top <= 180);
    let activeKey = null;

    if (aboveLine.length) {
      activeKey = aboveLine.reduce((a, b) => a.top > b.top ? a : b).key;
    } else if (candidates.length) {
      activeKey = candidates.reduce((a, b) => a.top < b.top ? a : b).key;
    }

    const lis = listEl.querySelectorAll('li[data-key]');
    lis.forEach(li => li.classList.toggle('active', li.dataset.key === activeKey));
  }

  // ---------------------------------------------------------------
  // Staying in sync: MutationObserver for new/loaded messages,
  // scroll listener for the highlight, and a light safety check that
  // also catches chat switches and the page removing our panel.
  // ---------------------------------------------------------------
  let timer = null;
  const schedule = (ms = 300) => {
    clearTimeout(timer);
    timer = setTimeout(refresh, ms);
  };

  // Detect ChatGPT navigation without a full page reload.
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function (...args) {
  const result = originalPushState.apply(this, args);
  schedule(100);
  return result;
};

history.replaceState = function (...args) {
  const result = originalReplaceState.apply(this, args);
  schedule(100);
  return result;
};

window.addEventListener('popstate', () => schedule(100));

  buildPanel();
  refresh();

  new MutationObserver(() => schedule()).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  let scrollTimer = null;
  document.addEventListener(
    'scroll',
    () => {
      if (scrollTimer) return;
      scrollTimer = setTimeout(() => { scrollTimer = null; updateActive(); }, 100);
    },
    true
  );

  setInterval(refresh, 2000);

  console.log(TAG, 'loaded');
})();
