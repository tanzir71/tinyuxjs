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
  // Docs: highlight the section in view and close the mobile menu after a jump.
  var toc = document.querySelector('[data-toc]');
  if (toc && 'IntersectionObserver' in window) {
    var links = {};
    var ids = [];
    Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]')).forEach(function (link) {
      var id = link.getAttribute('href').slice(1);
      links[id] = link;
      ids.push(id);
    });
    var visible = {};
    var setActive = function () {
      var current = null;
      for (var i = 0; i < ids.length; i++) {
        if (visible[ids[i]]) { current = ids[i]; break; }
      }
      if (!current) return;
      ids.forEach(function (id) { links[id].classList.toggle('is-active', id === current); });
    };
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { visible[entry.target.id] = entry.isIntersecting; });
      setActive();
    }, { rootMargin: '-88px 0px -55% 0px' });
    ids.forEach(function (id) {
      var section = document.getElementById(id);
      if (section) io.observe(section);
    });
  }
  Array.prototype.slice.call(document.querySelectorAll('.toc-mobile a')).forEach(function (link) {
    link.addEventListener('click', function () {
      var details = link.closest ? link.closest('details') : null;
      if (details) details.open = false;
    });
  });
})();
