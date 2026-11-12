// Drop-in chat widget, vanilla JS, no dependencies. UI only in this step —
// the fetch calls to /api/chat and /api/status are wired in Steps 4 and 5.
// Reads data-endpoint, data-persona, data-accent from its own script tag.

(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;

  var ENDPOINT = (script.dataset.endpoint || '/api').replace(/\/+$/, '');
  var ACCENT = script.dataset.accent || '#62110c';
  var MAX_MESSAGE = 500;
  var MAX_HISTORY = 6;

  var PERSONAS = ['exchange', 'food', 'cleaning'];
  var persona = PERSONAS.indexOf(script.dataset.persona) !== -1 ? script.dataset.persona : 'food';

  /* ---- state ------------------------------------------------------------ */
  // History lives in memory and in sessionStorage, per persona. It holds no
  // personal data beyond what the visitor typed, and dies with the tab.
  var history = [];
  var busy = false;

  /* ---- helpers ---------------------------------------------------------- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text; // never innerHTML
    return node;
  }

  function historyKey() {
    return 'bs-history-' + persona;
  }

  function loadHistory() {
    try {
      var raw = window.sessionStorage.getItem(historyKey());
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY) : [];
    } catch (_) {
      return [];
    }
  }

  function saveHistory() {
    try {
      window.sessionStorage.setItem(historyKey(), JSON.stringify(history.slice(-MAX_HISTORY)));
    } catch (_) {
      /* storage disabled: history stays in memory only, which is fine */
    }
  }

  /* ---- build UI --------------------------------------------------------- */
  var launcher = el('button', 'bs-launcher');
  launcher.type = 'button';
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-controls', 'bs-panel');
  launcher.textContent = 'Ask us';

  var panel = el('div', 'bs-panel');
  panel.id = 'bs-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Chat with the business assistant');

  var head = el('div', 'bs-head');
  var title = el('span', 'bs-title', 'Assistant');
  var close = el('button', 'bs-close', 'Close');
  close.type = 'button';
  head.appendChild(title);
  head.appendChild(close);

  var log = el('ul', 'bs-log');
  log.setAttribute('aria-live', 'polite');
  log.setAttribute('aria-relevant', 'additions');

  var form = el('form', 'bs-form');
  var input = el('textarea', 'bs-input');
  input.rows = 1;
  input.maxLength = MAX_MESSAGE;
  input.required = true;
  input.setAttribute('aria-label', 'Your question');
  input.setAttribute('placeholder', 'Ask a question…');

  var send = el('button', 'bs-send', 'Send');
  send.type = 'submit';

  form.appendChild(input);
  form.appendChild(send);

  var foot = el('div', 'bs-foot');
  var count = el('span', '', '0 / ' + MAX_MESSAGE);
  var privacy = el('span', '', 'Not stored');
  foot.appendChild(count);
  foot.appendChild(privacy);

  panel.appendChild(head);
  panel.appendChild(log);
  panel.appendChild(form);
  panel.appendChild(foot);

  var host = el('bracescripts-widget');
  host.style.setProperty('--bs-accent', ACCENT);
  host.appendChild(panel);
  host.appendChild(launcher);

  document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(host);
    history = loadHistory();
    addMessage('Hello. Ask me about services, prices or opening hours. I can also check an order with your reference and phone number.', 'bot');
  });

  /* ---- behaviour -------------------------------------------------------- */
  function open() {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    input.focus();
  }

  function closePanel() {
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus();
  }

  function addMessage(text, kind) {
    var li = el('li', 'bs-msg bs-msg--' + kind);
    li.textContent = text;
    log.appendChild(li);
    log.scrollTop = log.scrollHeight;
    return li;
  }

  function setBusy(state) {
    busy = state;
    send.disabled = state;
    input.disabled = state;
    send.textContent = state ? '…' : 'Send';
  }

  function updateCount() {
    var n = input.value.length;
    count.textContent = n + ' / ' + MAX_MESSAGE;
    count.className = n > MAX_MESSAGE ? 'bs-count-over' : '';
  }

  function setPersona(next) {
    if (PERSONAS.indexOf(next) === -1) return;
    persona = next;
    history = loadHistory();
  }

  function ask(text) {
    if (typeof text !== 'string') return;
    var clean = text.trim();
    if (!clean) return;
    open();
    input.value = clean;
    updateCount();
    form.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  launcher.addEventListener('click', function () {
    if (panel.hidden) open(); else closePanel();
  });

  close.addEventListener('click', closePanel);

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !panel.hidden) closePanel();
  });

  input.addEventListener('input', updateCount);

  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
    }
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (busy) return;

    var text = input.value.trim();
    if (!text) return;
    if (text.length > MAX_MESSAGE) {
      addMessage('Please keep your question under ' + MAX_MESSAGE + ' characters.', 'error');
      return;
    }

    addMessage(text, 'me');
    input.value = '';
    updateCount();

    sendMessage(text);
  });

  function sendMessage(text) {
    var pending = addMessage('…', 'bot');
    setBusy(true);

    fetch(ENDPOINT + '/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        persona: persona,
        message: text,
        history: history.slice(-MAX_HISTORY)
      })
    }).then(function (res) {
      // Read the status BEFORE the body: Netlify's own rate limit replies 429
      // with an empty body, so res.json() would throw on it.
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { status: res.status, data: data };
      });
    }).then(function (out) {
      pending.remove();
      setBusy(false);

      if (out.status === 200 && typeof out.data.reply === 'string') {
        addMessage(out.data.reply, 'bot');
        history.push({ role: 'user', content: text });
        history.push({ role: 'assistant', content: out.data.reply });
        history = history.slice(-MAX_HISTORY);
        saveHistory();
        if (out.data.handoff && out.data.handoff.url) showHandoff(out.data.handoff.url);
        document.dispatchEvent(new CustomEvent('bracescripts:meta', {
          detail: { provider: out.data.meta && out.data.meta.provider }
        }));
        return;
      }

      var message = (out.data && typeof out.data.message === 'string')
        ? out.data.message
        : 'Something went wrong. Please try again, or message us on WhatsApp.';
      addMessage(message, out.status === 429 ? 'note' : 'error');
      if (out.data && out.data.handoff && out.data.handoff.url) showHandoff(out.data.handoff.url);
    }).catch(function () {
      pending.remove();
      setBusy(false);
      addMessage('Could not reach the server. Check your connection and try again.', 'error');
    });
  }

  // The WhatsApp link is built by the SERVER. The browser only renders it.
  function showHandoff(url) {
    if (text_ok(url) === false) return;
    var li = el('li', 'bs-msg bs-msg--note');
    var a = document.createElement('a');
    a.href = url;
    a.textContent = 'Message us on WhatsApp';
    a.rel = 'noopener';
    a.target = '_blank';
    li.appendChild(a);
    log.appendChild(li);
    log.scrollTop = log.scrollHeight;
  }

  // Accept only an https wa.me link the server produced.
  function text_ok(url) {
    return typeof url === 'string' && /^https:\/\/wa\.me\/\d{10,15}\?/.test(url);
  }

  /* ---- public surface --------------------------------------------------- */
  // The demo page uses these two methods and nothing else.
  host.setPersona = setPersona;
  host.ask = ask;
})();
