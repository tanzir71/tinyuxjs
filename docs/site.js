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
      btn.textContent = 'COPIED';
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
})();
