// Silence removal tool: settings, analysis, review list, and cutting in Premiere.

var SilenceTool = (function () {
  var fs = require('fs');

  var DEFAULTS = {
    source: 'sequence',
    autoThreshold: true,
    threshold: -40,
    minSilence: 0.6,
    padBefore: 0.1,
    padAfter: 0.15,
    protectWords: true,
    language: 'he'
  };

  var opts = load();
  // cuts: [{start, end, keep}] in sequence seconds
  var result = null;
  var confirmTimer = null;

  function load() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('silenceSettings') || '{}')); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }

  function save() {
    try { localStorage.setItem('silenceSettings', JSON.stringify(opts)); } catch (e) {}
  }

  function $(sel) { return document.querySelector('#view-silence ' + sel); }

  function bind() {
    document.querySelectorAll('#view-silence .seg[data-silence]').forEach(function (seg) {
      var key = seg.dataset.silence;
      var buttons = seg.querySelectorAll('button');
      function render() { buttons.forEach(function (b) { b.classList.toggle('on', b.dataset.value === opts[key]); }); }
      buttons.forEach(function (b) { b.addEventListener('click', function () { opts[key] = b.dataset.value; save(); render(); }); });
      render();
    });

    document.querySelectorAll('#view-silence input[type=range][data-silence]').forEach(function (input) {
      var key = input.dataset.silence;
      var out = $('[data-silence-val="' + key + '"]');
      function show() { out.textContent = key === 'threshold' ? input.value + 'dB' : Number(input.value).toFixed(2) + 's'; }
      input.value = opts[key];
      show();
      input.addEventListener('input', show);
      input.addEventListener('change', function () { opts[key] = Number(input.value); save(); });
    });

    document.querySelectorAll('#view-silence input[type=checkbox][data-silence]').forEach(function (input) {
      var key = input.dataset.silence;
      input.checked = !!opts[key];
      input.addEventListener('change', function () { opts[key] = input.checked; save(); syncControls(); });
    });

    $('#btn-silence-analyze').addEventListener('click', analyze);
    $('#btn-silence-cut').addEventListener('click', cut);
    syncControls();
  }

  function syncControls() {
    $('input[data-silence="threshold"]').disabled = opts.autoThreshold;
    $('[data-silence-row="language"]').hidden = !opts.protectWords;
  }

  function analyze() {
    if (busy) return;
    if (!sequenceInfo || !sequenceInfo.sequence) return toast('פתח סיקוונס בטיימליין');
    var useInOut = opts.source === 'inout';
    if (useInOut && !sequenceInfo.hasInOut) return toast('סמן In ו-Out בטיימליין');
    var model = Platform.model(opts.language);
    if (opts.protectWords && !fs.existsSync(model.path)) {
      return toast('להגנה על מילים צריך את מודל ' + model.name + '. הורד אותו בכלי הכתוביות, או כבה את ההגנה');
    }

    setBusy(true);
    setProgress(5, 'מייצא אודיו מפרמייר…');
    setTimeout(function () {
      Transcriber.exportAudio(useInOut, function (err, audio) {
        if (err) return fail(err);
        var detected;
        try {
          setProgress(15, 'מחפש שקטים…');
          var level = Silence.loudness(fs.readFileSync(audio.wav));
          detected = Silence.detect(level, {
            threshold: opts.autoThreshold ? null : opts.threshold,
            minSilence: opts.minSilence,
            padBefore: opts.padBefore,
            padAfter: opts.padAfter
          });
        } catch (e) {
          Transcriber.cleanup(audio.wav);
          return fail(e);
        }

        function finish(cuts) {
          Transcriber.cleanup(audio.wav);
          result = {
            threshold: detected.threshold,
            cuts: cuts.map(function (c) { return { start: c.start + audio.offset, end: c.end + audio.offset, keep: true }; })
          };
          setBusy(false);
          setProgress(null);
          render();
        }

        if (!opts.protectWords || !detected.cuts.length) return finish(detected.cuts);
        setProgress(20, 'בודק מילים עם Whisper…');
        Transcriber.runWhisper(
          { bin: Platform.WHISPER_BIN, model: model.path, wav: audio.wav, language: opts.language },
          function (pct) { setProgress(20 + pct * 0.8, 'בודק מילים עם Whisper… ' + pct + '%'); },
          function (err, words) {
            if (err) { Transcriber.cleanup(audio.wav); return fail(err); }
            finish(Silence.protectWords(detected.cuts, words, Math.min(0.45, opts.minSilence * 0.75)));
          }
        );
      });
    }, 50);
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function render() {
    var box = $('#silence-results');
    box.innerHTML = '';
    if (!result) return box.appendChild(el('div', 'empty', 'השקטים שיימצאו יופיעו כאן לאישור'));
    if (!result.cuts.length) return box.appendChild(el('div', 'empty', 'לא נמצאו שקטים לפי ההגדרות'));

    var kept = result.cuts.filter(function (c) { return c.keep; });
    var head = el('div', 'editor-head');
    head.appendChild(el('span', '', 'נמצאו ' + result.cuts.length + ' שקטים · יחתכו ' + kept.length + ' · חיסכון ' + formatTime(Silence.totalDuration(kept))));
    var toggle = el('button', 'tool', kept.length === result.cuts.length ? 'נקה הכל' : 'בחר הכל');
    toggle.addEventListener('click', function () {
      var all = kept.length !== result.cuts.length;
      result.cuts.forEach(function (c) { c.keep = all; });
      render();
    });
    head.appendChild(toggle);
    box.appendChild(head);
    if (opts.autoThreshold) box.appendChild(el('div', 'hint', 'סף אוטומטי: ' + Math.round(result.threshold) + 'dB'));

    result.cuts.forEach(function (c) {
      var row = el('label', 'cut-row' + (c.keep ? '' : ' off'));
      var cb = el('input');
      cb.type = 'checkbox';
      cb.checked = c.keep;
      cb.addEventListener('change', function () { c.keep = cb.checked; render(); });
      var time = el('span', 'cap-time', formatTime(c.start) + ' → ' + formatTime(c.end));
      time.title = 'קפוץ לזמן הזה בטיימליין';
      time.addEventListener('click', function (e) { e.preventDefault(); seek(c.start); });
      row.appendChild(cb);
      row.appendChild(time);
      row.appendChild(el('span', 'cut-len', (c.end - c.start).toFixed(1) + 's'));
      box.appendChild(row);
    });
  }

  // First click arms the button; a second click within a few seconds cuts.
  function cut() {
    if (busy) return;
    var btn = $('#btn-silence-cut');
    var ranges = result ? result.cuts.filter(function (c) { return c.keep; }) : [];
    if (!ranges.length) return toast('אין שקטים מסומנים לחיתוך');
    if (!confirmTimer) {
      btn.textContent = 'לחץ שוב כדי לחתוך ' + ranges.length + ' שקטים (בעותק חדש)';
      confirmTimer = setTimeout(resetCutButton, 5000);
      return;
    }
    resetCutButton();

    setBusy(true);
    setProgress(20, 'בודק את הסיקוונס…');
    Premiere.call('checkSilenceCut', [], function (err, check) {
      if (err) return fail(err);
      if (check.locked.length) return fail(new Error('יש טראקים נעולים (' + check.locked.join(', ') + '). פתח אותם ונסה שוב'));
      setProgress(40, 'יוצר עותק של הסיקוונס…');
      SequenceCopy.make(' (silence cut)', function (err, pair) {
        if (err) return fail(err);
        setProgress(70, 'חותך בעותק…');
        Premiere.call('cutSilences', [ranges.map(function (c) { return { start: c.start, end: c.end }; })], function (err, res) {
          if (err) return fail(err);
          setBusy(false);
          setProgress(null);
          result = null;
          render();
          undo.remember(pair);
          var msg = 'נחתכו ' + res.cut + ' שקטים בסיקוונס החדש "' + pair.copy.name + '". המקור "' + pair.original.name + '" נשאר בלי שינוי';
          if (res.skipped) msg += ' · ' + res.skipped + ' דולגו כדי לא לשבור סנכרון';
          toast(msg);
        });
      });
    });
  }

  function resetCutButton() {
    clearTimeout(confirmTimer);
    confirmTimer = null;
    $('#btn-silence-cut').textContent = 'חתוך בפרמייר';
  }

  bind();
  var undo = SequenceCopy.undoButton($('#btn-silence-undo'), 'silenceLastCopy');
  return { analyze: analyze };
})();
