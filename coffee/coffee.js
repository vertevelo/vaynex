// Virtual Coffee landing page, shared by /coffee/ and /de/coffee/ (no IT/FR version, the call is English or German)
(function () {
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Count numbers up when they scroll into view
  function countUp(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (reduced) { el.textContent = target; return; }
    var start = null;
    function tick(t) {
      if (!start) start = t;
      var p = Math.min((t - start) / 1200, 1);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // 00:00 runs up to 15:00 on the agenda card
  function runClock(el) {
    if (reduced) { el.textContent = '15:00'; return; }
    var start = null;
    function tick(t) {
      if (!start) start = t;
      var p = Math.min((t - start) / 1600, 1);
      var secs = Math.round(900 * (1 - Math.pow(1 - p, 2)));
      var m = Math.floor(secs / 60), s = secs % 60;
      el.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function onReveal(el) {
    el.querySelectorAll('[data-count]').forEach(countUp);
    var clock = el.querySelector('[data-clock]');
    if (clock) runClock(clock);
  }

  var watched = document.querySelectorAll('.reveal, .steps, .agenda, .stats');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        onReveal(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' });
    watched.forEach(function (el) { io.observe(el); });
  } else {
    watched.forEach(function (el) { el.classList.add('in'); });
  }

  // Sticky apply button on phones: only while neither hero nor form is on screen
  var sticky = document.getElementById('stickyCta');
  var hero = document.querySelector('.hero');
  var apply = document.getElementById('apply');
  if (sticky && hero && apply && 'IntersectionObserver' in window) {
    var onScreen = { hero: true, apply: false };
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { onScreen[e.target === hero ? 'hero' : 'apply'] = e.isIntersecting; });
      sticky.classList.toggle('show', !onScreen.hero && !onScreen.apply);
    });
    so.observe(hero);
    so.observe(apply);
  }

  // Application form
  var form = document.getElementById('coffeeForm');
  if (!form) return;
  var required = ['first_name', 'artist_name', 'email', 'music_link', 'challenges', 'producer_wish', 'investment', 'confirm'];
  var fill = document.getElementById('progressFill');
  var text = document.getElementById('progressText');

  function answered(name) {
    var f = form.elements[name];
    if (!f) return false;
    if (f.type === 'checkbox') return f.checked;
    if (typeof f.length === 'number' && !f.tagName) return !!f.value; // radio group
    return f.value.trim() !== '' && f.checkValidity();
  }
  function updateProgress() {
    var done = required.filter(answered).length;
    fill.style.width = (done / required.length * 100) + '%';
    text.textContent = done + ' / ' + required.length;
  }
  form.addEventListener('input', updateProgress);
  form.addEventListener('change', updateProgress);
  updateProgress();

  // Where the visitor came from: ?src=reel137, utm tags, or the referring site
  var params = new URLSearchParams(location.search);
  var src = params.get('src') || params.get('utm_source') || '';
  if (!src && document.referrer) {
    try {
      var host = new URL(document.referrer).hostname;
      if (host.indexOf('vaynex.ch') === -1) src = host;
    } catch (err) { /* ignore */ }
  }
  if (params.get('utm_campaign')) src += ' / ' + params.get('utm_campaign');
  form.elements.source.value = src || 'direct';

  var errorBox = document.getElementById('formError');
  var success = document.getElementById('success');
  var progress = document.querySelector('.progress');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = form.querySelector('.submit');
    var label = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = form.getAttribute('data-sending');
    errorBox.hidden = true;
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(form)).toString()
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      success.querySelector('[data-name]').textContent = form.elements.first_name.value.trim();
      form.hidden = true;
      progress.hidden = true;
      success.hidden = false;
      document.getElementById('applyCard').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }).catch(function () {
      btn.disabled = false;
      btn.innerHTML = label;
      errorBox.hidden = false;
    });
  });
})();
