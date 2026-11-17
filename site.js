(function () {
  'use strict';

  function cleanText(el) {
    var clone = el.cloneNode(true);
    var buttons = clone.querySelectorAll ? clone.querySelectorAll('[data-copy-target]') : [];
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].parentNode) buttons[i].parentNode.removeChild(buttons[i]);
    }
    return clone.textContent.trim();
  }

  function copyText(text, btn) {
    function done() {
      var prev = btn.textContent;
      btn.textContent = prev === prev.toUpperCase() ? 'COPIED' : 'Copied';
      window.setTimeout(function () { btn.textContent = prev; }, 1200);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, done);
      return;
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    done();
  }

  Array.prototype.slice.call(document.querySelectorAll('[data-copy-target]')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      var el = document.getElementById(btn.getAttribute('data-copy-target'));
      if (!el) return;
      copyText(cleanText(el), btn);
    });
  });

  Array.prototype.slice.call(document.querySelectorAll('[data-menu-toggle]')).forEach(function (btn) {
    var header = btn.closest ? btn.closest('.header-inner') : null;
    var nav = document.getElementById(btn.getAttribute('aria-controls'));
    if (!header || !nav) return;

    function setMenu(open) {
      header.classList.toggle('is-menu-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    }

    btn.addEventListener('click', function () {
      setMenu(btn.getAttribute('aria-expanded') !== 'true');
    });

    nav.addEventListener('click', function (event) {
      if (event.target && event.target.closest && event.target.closest('a')) setMenu(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') setMenu(false);
    });

    window.addEventListener('resize', function () {
      if (window.matchMedia && window.matchMedia('(min-width: 721px)').matches) setMenu(false);
    });
  });
})();
