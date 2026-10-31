// Podcast tool: map speakers to mic/camera tracks, analyse who speaks, switch cameras on a copy.

var PodcastTool = (function () {
  var fs = require('fs');
  var MAX_SPEAKERS = 4;
  var COLORS = ['#4b8df8', '#e5a33b', '#3fb950', '#d16bd1'];
  var WIDE_COLOR = '#8a8a8a';

  var DEFAULTS = {
    source: 'sequence',
    speakers: [{ name: 'דובר 1', mic: 0, cam: 0 }, { name: 'דובר 2', mic: 1, cam: 1 }],
    wide: 2,
    minShot: 2,
    minTurn: 1.2,
    wideOnOverlap: true,
    varietyEvery: 25,
    varietyLength: 4
  };

  var opts = load();
  var tracks = { video: [], audio: [] };
  var plan = null; // { shots, offset, duration, speakers }
  var applyTimer = null;

  function load() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('podcastSettings') || '{}')); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }

  function save() {
    try { localStorage.setItem('podcastSettings', JSON.stringify(opts)); } catch (e) {}
  }

  function $(sel) { return document.querySelector('#view-podcast ' + sel); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // ---- Track mapping ----

  function loadTracks(silent) {
    Premiere.call('getTracks', [], function (err, res) {
      if (err) return silent === true ? null : toast('לא ניתן לקרוא את הטראקים של הסיקוונס');
      tracks = res;
      renderSpeakers();
    });
  }

  function trackSelect(list, prefix, value, allowNone, onChange) {
    var sel = el('select', 'sel');
    if (allowNone) sel.appendChild(new Option('—', ''));
    list.forEach(function (t) {
      var label = prefix + (t.index + 1) + (t.name && t.name !== prefix + (t.index + 1) ? ' · ' + t.name : '') + (t.clips ? '' : ' (ריק)');
      sel.appendChild(new Option(label, String(t.index)));
    });
    // Keep a saved choice visible even before the track list loads.
    if (value != null && !list.some(function (t) { return t.index === value; })) sel.appendChild(new Option(prefix + (value + 1), String(value)));
    sel.value = value == null ? '' : String(value);
    sel.addEventListener('change', function () { onChange(sel.value === '' ? null : Number(sel.value)); save(); });
    return sel;
  }

  function renderSpeakers() {
    var grid = $('#podcast-speakers');
    grid.innerHTML = '';
    ['שם', 'מיקרופון', 'מצלמה', ''].forEach(function (h) { grid.appendChild(el('span', 'h', h)); });
    opts.speakers.forEach(function (sp, i) {
      var name = el('input');
      name.type = 'text';
      name.value = sp.name;
      name.addEventListener('change', function () { sp.name = name.value.trim() || 'דובר ' + (i + 1); save(); });
      grid.appendChild(name);
      grid.appendChild(trackSelect(tracks.audio, 'A', sp.mic, false, function (v) { sp.mic = v; }));
      grid.appendChild(trackSelect(tracks.video, 'V', sp.cam, true, function (v) { sp.cam = v; }));
      var remove = el('button', 'tool', '✕');
      remove.title = 'הסר דובר';
      remove.disabled = opts.speakers.length <= 2;
      remove.addEventListener('click', function () { opts.speakers.splice(i, 1); save(); renderSpeakers(); });
      grid.appendChild(remove);
    });
    $('#btn-podcast-add').hidden = opts.speakers.length >= MAX_SPEAKERS;

    var wide = $('#podcast-wide');
    var fresh = trackSelect(tracks.video, 'V', opts.wide, true, function (v) { opts.wide = v; });
    fresh.id = 'podcast-wide';
    wide.replaceWith(fresh);
  }

  function addSpeaker() {
    var n = opts.speakers.length;
    if (n >= MAX_SPEAKERS) return;
    opts.speakers.push({ name: 'דובר ' + (n + 1), mic: Math.min(n, Math.max(0, tracks.audio.length - 1)), cam: n < tracks.video.length ? n : null });
    save();
    renderSpeakers();
  }

  // ---- Settings ----

  function bindSettings() {
    document.querySelectorAll('#view-podcast .seg[data-podcast]').forEach(function (seg) {
      var key = seg.dataset.podcast;
      var buttons = seg.querySelectorAll('button');
      function render() { buttons.forEach(function (b) { b.classList.toggle('on', b.dataset.value === opts[key]); }); }
      buttons.forEach(function (b) { b.addEventListener('click', function () { opts[key] = b.dataset.value; save(); render(); }); });
      render();
    });
    document.querySelectorAll('#view-podcast input[type=range][data-podcast]').forEach(function (input) {
      var key = input.dataset.podcast;
      var out = $('[data-podcast-val="' + key + '"]');
      function show() { out.textContent = key === 'varietyEvery' && Number(input.value) === 0 ? 'כבוי' : Number(input.value).toFixed(1) + 's'; }
      input.value = opts[key];
      show();
      input.addEventListener('input', show);
      input.addEventListener('change', function () { opts[key] = Number(input.value); save(); });
    });
    document.querySelectorAll('#view-podcast input[type=checkbox][data-podcast]').forEach(function (input) {
      var key = input.dataset.podcast;
      input.checked = !!opts[key];
      input.addEventListener('change', function () { opts[key] = input.checked; save(); });
    });
  }

  // ---- Analysis ----

  function validate() {
    var mics = opts.speakers.map(function (s) { return s.mic; });
    if (mics.some(function (m, i) { return mics.indexOf(m) !== i; })) return 'לכל דובר צריך מיקרופון אחר';
    if (!opts.speakers.some(function (s) { return s.cam != null; })) return 'בחר מצלמה לפחות לדובר אחד';
    return null;
  }

  function analyze() {
    if (busy) return;
    if (!sequenceInfo || !sequenceInfo.sequence) return toast('פתח סיקוונס בטיימליין');
    var useInOut = opts.source === 'inout';
    if (useInOut && !sequenceInfo.hasInOut) return toast('סמן In ו-Out בטיימליין');
    var problem = validate();
    if (problem) return toast(problem);

    setBusy(true);
    var levels = [], offset = 0, duration = 0;
    var speakers = opts.speakers.slice();

    function next(i) {
      if (i >= speakers.length) return finish();
      setProgress(5 + i / speakers.length * 85, 'מייצא את המיקרופון של ' + speakers[i].name + '…');
      setTimeout(function () {
        Transcriber.exportAudio(useInOut, function (err, audio) {
          if (err) return fail(err);
          try {
            var level = Silence.loudness(fs.readFileSync(audio.wav));
            levels.push(level.db);
            offset = audio.offset;
            duration = level.duration;
          } catch (e) {
            Transcriber.cleanup(audio.wav);
            return fail(e);
          }
          Transcriber.cleanup(audio.wav);
          next(i + 1);
        }, speakers[i].mic);
      }, 50);
    }

    function finish() {
      setProgress(95, 'מתכנן שוטים…');
      var act = Podcast.activity(levels);
      var shots = Podcast.planShots(act, duration, {
        cameras: speakers.map(function (s) { return s.cam; }),
        wide: opts.wide,
        minShot: opts.minShot,
        minTurn: opts.minTurn,
        wideOnOverlap: opts.wideOnOverlap,
        varietyEvery: opts.varietyEvery,
        varietyLength: opts.varietyLength
      });
      plan = { shots: shots, offset: offset, duration: duration, speakers: speakers };
      setBusy(false);
      setProgress(null);
      render();
    }

    next(0);
  }

  function colorOf(who) { return who === 'wide' ? WIDE_COLOR : COLORS[who % COLORS.length]; }
  function nameOf(who) { return who === 'wide' ? 'שוט רחב' : plan.speakers[who].name; }

  function render() {
    var box = $('#podcast-results');
    box.innerHTML = '';
    if (!plan) return box.appendChild(el('div', 'empty', 'תוכנית השוטים תופיע כאן לפני החיתוך'));
    if (!plan.shots.length) return box.appendChild(el('div', 'empty', 'לא זוהה דיבור. בדוק שהמיקרופונים נכונים'));

    var stats = Podcast.stats(plan.shots);
    box.appendChild(el('div', '', plan.shots.length + ' שוטים · ' + stats.switches + ' החלפות מצלמה'));

    // Timeline strip: one block per shot, coloured by who is on screen.
    var strip = el('div', 'strip');
    plan.shots.forEach(function (s) {
      var block = el('span');
      block.style.width = ((s.end - s.start) / plan.duration * 100) + '%';
      block.style.background = colorOf(s.who);
      block.title = nameOf(s.who) + ' · ' + formatTime(s.start + plan.offset) + ' → ' + formatTime(s.end + plan.offset);
      block.addEventListener('click', function () { seek(s.start + plan.offset); });
      strip.appendChild(block);
    });
    box.appendChild(strip);

    var legend = el('div', 'legend');
    Object.keys(stats.time).forEach(function (key) {
      var who = key === 'wide' ? 'wide' : Number(key);
      var item = el('span');
      var dot = el('i');
      dot.style.background = colorOf(who);
      item.appendChild(dot);
      item.appendChild(document.createTextNode(nameOf(who) + ' ' + Math.round(stats.time[key] / plan.duration * 100) + '%'));
      legend.appendChild(item);
    });
    box.appendChild(legend);
  }

  // ---- Apply in Premiere ----

  // First click arms the button; a second click within a few seconds edits.
  function apply() {
    if (busy) return;
    if (!plan || !plan.shots.length) return toast('קודם נתח את הסיקוונס');
    var btn = $('#btn-podcast-apply');
    if (!applyTimer) {
      btn.textContent = 'לחץ שוב כדי לערוך (בעותק חדש)';
      applyTimer = setTimeout(resetApplyButton, 5000);
      return;
    }
    resetApplyButton();

    var shots = plan.shots.map(function (s) { return { start: s.start + plan.offset, end: s.end + plan.offset, camera: s.camera }; });
    var cameras = [];
    shots.forEach(function (s) { if (cameras.indexOf(s.camera) < 0) cameras.push(s.camera); });

    setBusy(true);
    setProgress(15, 'בודק את הסיקוונס…');
    Premiere.call('checkSilenceCut', [], function (err, check) {
      if (err) return fail(err);
      if (check.locked.length) return fail(new Error('יש טראקים נעולים (' + check.locked.join(', ') + '). פתח אותם ונסה שוב'));
      setProgress(30, 'יוצר עותק של הסיקוונס…');
      SequenceCopy.make(' (podcast edit)', function (err, pair) {
        if (err) return fail(err);
        setProgress(55, 'מחליף מצלמות…');
        Premiere.call('applyMulticam', [shots, cameras], function (err, res) {
          if (err) return fail(err);
          done(pair, res);
        });
      });
    });
  }

  function done(pair, res) {
    setBusy(false);
    setProgress(null);
    undo.remember(pair);
    toast('נערך בסיקוונס החדש "' + pair.copy.name + '": ' + res.shots + ' שוטים. המקור נשאר בלי שינוי');
    plan = null;
    render();
  }

  function resetApplyButton() {
    clearTimeout(applyTimer);
    applyTimer = null;
    $('#btn-podcast-apply').textContent = 'ערוך בפרמייר';
  }

  bindSettings();
  renderSpeakers();
  $('#btn-podcast-tracks').addEventListener('click', loadTracks);
  $('#btn-podcast-add').addEventListener('click', addSpeaker);
  $('#btn-podcast-analyze').addEventListener('click', analyze);
  $('#btn-podcast-apply').addEventListener('click', apply);
  var undo = SequenceCopy.undoButton($('#btn-podcast-undo'), 'podcastLastCopy');
  // Track names come from Premiere; load them whenever the tool is opened.
  document.querySelector('.tool-card[data-tool="podcast"]').addEventListener('click', function () { loadTracks(true); });
  loadTracks(true);

  return { analyze: analyze };
})();
