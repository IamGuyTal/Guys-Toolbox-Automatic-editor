// Reels tool: transcribe the episode, ask the AI for reels, review them, create sequences.

var ReelsTool = (function () {
  var fs = require('fs');
  var AI_TIMEOUT = 10 * 60 * 1000;

  var DEFAULTS = {
    source: 'sequence',
    language: 'he',
    useSpeakers: true,
    focus: 'guest',
    guest: 0,
    vertical: true
  };

  var opts = load();
  var reels = null;        // resolved reels from the AI
  var context = null;      // { sourceId, sourceName, offset, speakers }
  var transcriptCache = {}; // "<seqId>|<source>|<in>|<out>|<lang>" -> { words, offset, mix }

  function load() {
    try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('reelsSettings') || '{}')); }
    catch (e) { return Object.assign({}, DEFAULTS); }
  }

  function save() {
    try { localStorage.setItem('reelsSettings', JSON.stringify(opts)); } catch (e) {}
  }

  function $(sel) { return document.querySelector('#view-reels ' + sel); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  // Speaker names and mics come from the podcast tool's settings.
  function podcastSpeakers() {
    try { return (JSON.parse(localStorage.getItem('podcastSettings') || '{}').speakers) || null; } catch (e) { return null; }
  }

  // ---- Settings ----

  function bind() {
    document.querySelectorAll('#view-reels .seg[data-reels]').forEach(function (seg) {
      var key = seg.dataset.reels;
      var buttons = seg.querySelectorAll('button');
      function render() { buttons.forEach(function (b) { b.classList.toggle('on', b.dataset.value === opts[key]); }); }
      buttons.forEach(function (b) { b.addEventListener('click', function () { opts[key] = b.dataset.value; save(); render(); syncControls(); }); });
      render();
    });
    document.querySelectorAll('#view-reels input[type=checkbox][data-reels]').forEach(function (input) {
      var key = input.dataset.reels;
      input.checked = !!opts[key];
      input.addEventListener('change', function () { opts[key] = input.checked; save(); syncControls(); });
    });
    $('#reels-guest').addEventListener('change', function () { opts.guest = Number($('#reels-guest').value); save(); });
    $('#btn-reels-find').addEventListener('click', find);
    $('#btn-reels-create').addEventListener('click', create);
    document.querySelector('.tool-card[data-tool="reels"]').addEventListener('click', syncControls);
    syncControls();
  }

  function syncControls() {
    var speakers = podcastSpeakers();
    var canUse = speakers && speakers.length > 1;
    $('[data-reels="useSpeakers"]').disabled = !canUse;
    var on = canUse && opts.useSpeakers;
    $('[data-reels-row="focus"]').hidden = !on;
    var sel = $('#reels-guest');
    sel.innerHTML = '';
    (speakers || []).forEach(function (s, i) { sel.appendChild(new Option(s.name, String(i))); });
    sel.value = String(Math.min(opts.guest, Math.max(0, (speakers || []).length - 1)));
    sel.hidden = opts.focus !== 'guest';
  }

  // ---- Find reels ----

  function find() {
    if (busy) return;
    if (!sequenceInfo || !sequenceInfo.sequence) return toast('פתח סיקוונס בטיימליין');
    var useInOut = opts.source === 'inout';
    if (useInOut && !sequenceInfo.hasInOut) return toast('סמן In ו-Out בטיימליין');
    var provider = AI_PROVIDERS[settings.aiProvider];
    var key = (localStorage.getItem(provider.keyName) || '').trim();
    if (!key) return toast('הדבק מפתח ' + provider.name + ' בהגדרות ה-AI');
    var model = Platform.model(opts.language);
    if (!fs.existsSync(model.path)) return toast('צריך את מודל ' + model.name + '. הורד אותו בכלי הכתוביות');

    var speakers = podcastSpeakers();
    var useSpeakers = opts.useSpeakers && speakers && speakers.length > 1;
    var info = sequenceInfo;
    var cacheKey = [info.id, opts.source, useInOut ? info.inPoint : '', useInOut ? info.outPoint : '', opts.language].join('|');

    setBusy(true);
    var offset = 0, words = null, act = null, mix = null, levels = null;

    function step1Transcribe() {
      if (transcriptCache[cacheKey]) {
        words = transcriptCache[cacheKey].words;
        offset = transcriptCache[cacheKey].offset;
        mix = transcriptCache[cacheKey].mix;
        return step2Speakers();
      }
      setProgress(3, 'מייצא אודיו מפרמייר…');
      setTimeout(function () {
        Transcriber.exportAudio(useInOut, function (err, audio) {
          if (err) return fail(err);
          offset = audio.offset;
          try { mix = Silence.loudness(fs.readFileSync(audio.wav)).db; } catch (e) { mix = null; }
          Transcriber.runWhisper(
            { bin: Platform.WHISPER_BIN, model: model.path, wav: audio.wav, language: opts.language },
            function (pct) { setProgress(5 + pct * 0.6, 'מתמלל את הפרק… ' + pct + '%'); },
            function (err, w) {
              Transcriber.cleanup(audio.wav);
              if (err) return fail(err);
              words = w;
              transcriptCache[cacheKey] = { words: w, offset: offset, mix: mix };
              step2Speakers();
            }
          );
        });
      }, 50);
    }

    function step2Speakers() {
      levels = mix ? [mix] : null;
      if (!useSpeakers) return step3Ask();
      var mics = [];
      (function next(i) {
        if (i >= speakers.length) {
          levels = mics;
          act = Podcast.activity(mics);
          return step3Ask();
        }
        setProgress(66 + i * 4, 'מזהה דוברים… (' + speakers[i].name + ')');
        Transcriber.exportAudio(useInOut, function (err, audio) {
          if (err) return fail(err);
          try { mics.push(Silence.loudness(fs.readFileSync(audio.wav)).db); }
          catch (e) { Transcriber.cleanup(audio.wav); return fail(e); }
          Transcriber.cleanup(audio.wav);
          next(i + 1);
        }, speakers[i].mic);
      })(0);
    }

    function step3Ask() {
      if (!words.length) return fail(new Error('לא זוהה דיבור בסיקוונס'));
      var us = Reels.units(words, act ? Reels.speakerLookup(act) : null);
      var prompt = Reels.buildPrompt(us, {
        speakers: useSpeakers ? speakers.map(function (s) { return s.name; }) : null,
        guest: opts.guest,
        focus: opts.focus
      });
      setProgress(80, provider.name + ' מחפש רילז בפרק… (זה יכול לקחת כמה דקות)');
      var req = { key: key, prompt: prompt, schema: Reels.SCHEMA, timeout: AI_TIMEOUT, effort: 'high', maxTokens: 32000 };
      provider.client().json(req, function (err, res) {
        if (err) return fail(err);
        reels = Reels.resolve(res.data, us);
        // Snap each piece to the actual speech and join pieces that nearly touch.
        reels.forEach(function (r) { r.segments = Reels.mergeClose(Reels.refine(r.segments, us, levels), 0.8); });
        context = { sourceId: info.id, sourceName: info.sequence, offset: offset, speakers: useSpeakers ? speakers : null };
        setBusy(false);
        setProgress(null);
        render();
        var costText = res.cost ? ' · עלות: $' + res.cost.toFixed(3) : '';
        toast((reels.length ? 'נמצאו ' + reels.length + ' רילז' : 'לא נמצאו קטעים שעוברים את הרף') + costText);
      });
    }

    step1Transcribe();
  }

  // ---- Review ----

  function render() {
    var box = $('#reels-results');
    box.innerHTML = '';
    if (!reels) return box.appendChild(el('div', 'empty', 'הרילז שיימצאו יופיעו כאן לבחירה'));
    if (!reels.length) return box.appendChild(el('div', 'empty', 'לא נמצאו קטעים שעוברים את הרף'));

    var kept = reels.filter(function (r) { return r.keep; }).length;
    box.appendChild(el('div', 'hint', kept + ' מתוך ' + reels.length + ' רילז מסומנים. לחיצה על זמן קופצת לטיימליין'));

    reels.forEach(function (reel) {
      var card = el('div', 'reel' + (reel.keep ? '' : ' off'));
      var head = el('label', 'reel-head');
      var cb = el('input');
      cb.type = 'checkbox';
      cb.checked = reel.keep;
      cb.addEventListener('change', function () { reel.keep = cb.checked; render(); });
      head.appendChild(cb);
      head.appendChild(el('span', 'reel-score', String(reel.score)));
      head.appendChild(el('b', 'reel-title', reel.title));
      head.appendChild(el('span', 'reel-len', formatTime(Reels.duration(reel)) + (reel.reordered ? ' · ⟲ סדר שונה' : '')));
      card.appendChild(head);
      card.appendChild(el('div', 'reel-hook', '“' + reel.hook + '”'));
      card.appendChild(el('div', 'hint', reel.why));

      reel.segments.forEach(function (seg, i) {
        var row = el('div', 'reel-seg');
        var time = el('span', 'cap-time', formatTime(seg.start + context.offset));
        time.title = 'קפוץ לזמן הזה בטיימליין';
        time.addEventListener('click', function () { seek(seg.start + context.offset); });
        row.appendChild(time);
        var text = el('span', 'reel-text', seg.text);
        text.dir = 'auto';
        row.appendChild(text);
        if (reel.segments.length > 1) {
          var remove = el('button', 'tool', '✕');
          remove.title = 'הסר את הקטע מהריל';
          remove.addEventListener('click', function () { reel.segments.splice(i, 1); render(); });
          row.appendChild(remove);
        }
        card.appendChild(row);
      });
      box.appendChild(card);
    });
  }

  // ---- Create sequences ----

  function safeTitle(t) {
    return String(t || '').replace(/[\/\\:*?"<>|]/g, ' ').trim().slice(0, 50);
  }

  function create() {
    if (busy) return;
    var chosen = (reels || []).filter(function (r) { return r.keep && r.segments.length; });
    if (!chosen.length) return toast('אין רילז מסומנים');

    setBusy(true);
    var made = 0, errors = [];
    (function next(i) {
      if (i >= chosen.length) {
        setBusy(false);
        setProgress(null);
        if (errors.length && !made) return toast('יצירת הרילז נכשלה: ' + errors[0]);
        return toast('נוצרו ' + made + ' סיקוונסים בתיקייה Reels' + (errors.length ? ' · ' + errors.length + ' נכשלו' : ''));
      }
      var reel = chosen[i];
      setProgress((i / chosen.length) * 100, 'יוצר ריל ' + (i + 1) + ' מתוך ' + chosen.length + '…');
      var name = context.sourceName + ' - Reel ' + (i + 1) + ' - ' + safeTitle(reel.title);
      var segs = reel.segments.map(function (s) { return { start: s.start + context.offset, end: s.end + context.offset, camera: cameraFor(s) }; });
      var mics = context.speakers ? context.speakers.map(function (sp) { return sp.mic; }) : null;
      Premiere.call('createReel', [context.sourceId, name, segs, opts.vertical, 'Reels', mics], function (err) {
        if (err) errors.push(err.message); else made++;
        next(i + 1);
      });
    })(0);
  }

  // Which camera a piece shows: the interviewee's in "interviewee" focus, otherwise the
  // camera of whoever speaks in that piece. null when there is no podcast setup (nested source).
  function cameraFor(seg) {
    var sp = context.speakers;
    if (!sp) return null;
    var guest = sp[Math.min(opts.guest, sp.length - 1)];
    var who = opts.focus === 'all' && seg.speaker >= 0 ? sp[seg.speaker] : guest;
    var cam = who && who.cam != null ? who.cam : guest.cam;
    return cam == null ? null : cam;
  }

  bind();
  return { find: find };
})();
