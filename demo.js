// Demo page behaviour only: persona switch, sample questions, provider chip.
// It never calls the model directly — every request goes through the widget.

const PERSONAS = {
  exchange: {
    label: 'Exchange',
    accent: '#1f3a93',
    samples: [
      'What assets can I buy?',
      'How long do NGN withdrawals take?',
      'What are your KYC limits?',
      'Status of TX-4A9F2C'
    ]
  },
  food: {
    label: 'Food delivery',
    accent: '#62110c',
    samples: [
      'What is on the menu?',
      'Do you deliver to Mowe?',
      'How much is a family pack?',
      'Where is my order SPG-1001?'
    ]
  },
  cleaning: {
    label: 'Cleaning',
    accent: '#0b6b4f',
    samples: [
      'What services do you offer?',
      'Do you cover Kano?',
      'How does pricing work?',
      'Status of booking DK-1042'
    ]
  }
};

const ALLOWED = Object.keys(PERSONAS);

function currentPersona() {
  const fromUrl = new URLSearchParams(window.location.search).get('persona');
  return ALLOWED.includes(fromUrl) ? fromUrl : 'food';
}

function applyPersona(key) {
  const persona = PERSONAS[key];
  document.documentElement.style.setProperty('--accent', persona.accent);

  document.querySelectorAll('.pill').forEach(function (btn) {
    btn.setAttribute('aria-pressed', String(btn.dataset.persona === key));
  });

  const list = document.getElementById('samples');
  list.textContent = '';
  persona.samples.forEach(function (text) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sample';
    b.textContent = text;
    b.addEventListener('click', function () {
      const widget = document.querySelector('bracescripts-widget');
      if (widget && typeof widget.ask === 'function') widget.ask(text);
    });
    list.appendChild(b);
  });

  const url = new URL(window.location.href);
  url.searchParams.set('persona', key);
  window.history.replaceState(null, '', url);

  const widget = document.querySelector('bracescripts-widget');
  if (widget && typeof widget.setPersona === 'function') widget.setPersona(key);
}

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.pill').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (ALLOWED.includes(btn.dataset.persona)) applyPersona(btn.dataset.persona);
    });
  });
  applyPersona(currentPersona());
});

// The widget emits this once a reply arrives, so the chip shows who answered.
document.addEventListener('bracescripts:meta', function (event) {
  const note = document.getElementById('provider-note');
  const provider = event.detail && event.detail.provider;
  if (!note || !provider) return;
  const name = provider === 'gemini' ? 'Gemini' : provider === 'groq' ? 'Groq' : null;
  note.textContent = name
    ? 'Answered by ' + name + '. This is a live model call, not a scripted reply.'
    : 'Answers are produced by a language model that can see only the facts file.';
});
