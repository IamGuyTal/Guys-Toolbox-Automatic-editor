// Panel logic: settings, status checks, and button wiring.

var fs = require('fs');
var path = require('path');

var DEFAULTS = {
  language: 'he',
  source: 'sequence',
  wordsPerCaption: 3,
  lines: '1',
  fillGaps: true,
  stripPunctuation: true,
  aiProvider: 'gemini'
};

var settings = loadSettings();

// Current transcription. offset = where the audio starts in the sequence (seconds).
var state = { words: null, offset: 0, captions: [] };
var sequenceInfo = null;
var busy = false;

function loadSettings() {
  try {
    var saved = JSON.parse(localStorage.getItem('settings') || '{}');
    return Object.assign({}, DEFAULTS, saved);
  } catch (e) {
    return Object.assign({}, DEFAULTS);
  }
}

// Settings that change how words are grouped need a rebuild (which drops manual edits);
// the rest only re-time or re-render the existing captions.
var REBUILD_SETTINGS = ['wordsPerCaption', 'lines'];

function saveSettings(key) {
  localStorage.setItem('settings', JSON.stringify(settings));
  if (key === 'language') return checkWhisper();
  if (key === 'aiProvider') return showAiKeyRow();
  if (!state.words) return;
  if (REBUILD_SETTINGS.indexOf(key) >= 0) {
    if (state.edited) {
      Editor.snapshot();
      toast('הכתוביות נבנו מחדש לפי ההגדרה. "בטל" מחזיר את העריכות');
    }
    rebuildCaptions();
  } else {
    Captions.retimeAll(state.captions, settings);
    Editor.render();
  }
}

function rebuildCaptions() {
  state.captions = Captions.build(state.words, settings);
  state.edited = false;
  Editor.render();
}

// SRT files are kept in a "Captions" folder next to the project (or in tmp for unsaved projects).
function srtFolder(projectPath) {
  var dir = projectPath ? path.join(path.dirname(projectPath), 'Captions') : path.join(require('os').tmpdir(), 'premiere-captions');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeName(name) {
  return String(name || 'sequence').replace(/[\/\\:*?"<>|]/g, '_').slice(0, 60);
}

function applyToPremiere() {
  if (busy) return;
  if (!state.captions.length) return toast('קודם תמלל את הסיקוונס');
  setBusy(true);
  Premiere.call('getProjectPath', [], function (err, res) {
    if (err) return fail(err);
    var stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    var file = path.join(srtFolder(res.path), safeName(sequenceInfo && sequenceInfo.sequence) + ' ' + stamp + '.srt');
    try {
      fs.writeFileSync(file, Captions.toSRT(state.captions, settings, state.offset), 'utf8');
    } catch (e) {
      return fail(e);
    }
    Premiere.call('addCaptionTrack', [file], function (err) {
      setBusy(false);
      if (err) return fail(err);
      toast('נוסף Caption Track עם ' + state.captions.length + ' כתוביות');
    });
  });
}

// Sends the current (possibly hand-edited) words to Gemini for proofreading and phrasing.
// AI providers for "improve": both share the same improve(opts, cb) interface.
var AI_PROVIDERS = {
  gemini: { name: 'Gemini', client: function () { return Gemini; }, keyName: 'geminiKey', input: 'gemini-key' },
  claude: { name: 'Claude', client: function () { return Claude; }, keyName: 'claudeKey', input: 'claude-key' }
};

function improve() {
  if (busy) return;
  if (!state.captions.length) return toast('קודם תמלל את הסיקוונס');
  var provider = AI_PROVIDERS[settings.aiProvider];
  var key = (localStorage.getItem(provider.keyName) || '').trim();
  if (!key) {
    document.getElementById(provider.input).focus();
    return toast('הדבק מפתח ' + provider.name + ' בהגדרות');
  }

  var words = [];
  state.captions.forEach(function (c) { words = words.concat(c.words); });

  setBusy(true);
  setProgress(50, provider.name + ' עובר על הטקסט…');
  provider.client().improve({
    key: key,
    words: words,
    language: settings.language,
    maxWords: settings.wordsPerCaption * Number(settings.lines)
  }, function (err, result) {
    if (err) return fail(err);
    Editor.snapshot();
    var res = Captions.applyImprovement(words, result, settings);
    state.words = res.words;
    state.captions = res.captions;
    state.edited = true;
    Editor.render();
    setBusy(false);
    setProgress(null);
    var costText = result.cost ? ' · עלות: $' + result.cost.toFixed(3) : '';
    toast((res.changed ? provider.name + ' תיקן ' + res.changed + ' מילים (מסומנות בצהוב). "בטל" מחזיר' : provider.name + ' לא מצא מה לתקן, רק סידר את החלוקה') + costText);
  });
}

function bindAiSettings() {
  Object.keys(AI_PROVIDERS).forEach(function (id) {
    var p = AI_PROVIDERS[id];
    var input = document.getElementById(p.input);
    input.value = localStorage.getItem(p.keyName) || '';
    input.addEventListener('change', function () {
      localStorage.setItem(p.keyName, input.value.trim());
      if (id === 'gemini') localStorage.removeItem('geminiModel');
      toast(input.value.trim() ? 'מפתח ' + p.name + ' נשמר' : 'מפתח ' + p.name + ' נמחק');
    });
  });
  document.querySelectorAll('[data-open]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      window.cep.util.openURLInDefaultBrowser(a.dataset.open);
    });
  });
  showAiKeyRow();
}

// Only the key field of the selected provider is shown.
function showAiKeyRow() {
  document.getElementById('row-gemini-key').hidden = settings.aiProvider !== 'gemini';
  document.getElementById('row-claude-key').hidden = settings.aiProvider !== 'claude';
}

function seek(seconds) {
  Premiere.call('setPlayhead', [seconds], function (err) { if (err) toast('לא ניתן להזיז את הסמן'); });
}

function setProgress(pct, text) {
  var box = document.getElementById('progress');
  if (pct === null) return box.classList.remove('show');
  box.classList.add('show');
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-text').textContent = text;
}

function setBusy(b) {
  busy = b;
  document.querySelectorAll('button').forEach(function (btn) { btn.disabled = b; });
}

function fail(err) {
  setBusy(false);
  setProgress(null);
  toast(err.message || String(err));
  console.error(err);
}

function transcribe() {
  if (busy) return;
  if (!sequenceInfo || !sequenceInfo.sequence) return toast('פתח סיקוונס בטיימליין');
  var useInOut = settings.source === 'inout';
  if (useInOut && !sequenceInfo.hasInOut) return toast('סמן In ו-Out בטיימליין');
  if (!checkWhisper()) return toast('קודם צריך להוריד את מודל התמלול');

  setBusy(true);
  setProgress(5, 'מייצא אודיו מפרמייר…');
  // Let the progress bar paint before Premiere blocks on the export
  setTimeout(function () {
    Transcriber.exportAudio(useInOut, function (err, audio) {
      if (err) return fail(err);
      setProgress(10, 'מתמלל…');
      Transcriber.runWhisper(
        { bin: Platform.WHISPER_BIN, model: Platform.model(settings.language).path, wav: audio.wav, language: settings.language },
        function (pct) { setProgress(10 + pct * 0.9, 'מתמלל… ' + pct + '%'); },
        function (err, words) {
          Transcriber.cleanup(audio.wav);
          if (err) return fail(err);
          state.words = words;
          state.offset = audio.offset;
          Editor.reset();
          rebuildCaptions();
          setBusy(false);
          setProgress(null);
          toast('התמלול הסתיים: ' + state.captions.length + ' כתוביות');
        }
      );
    });
  }, 50);
}

function toast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(function () { el.classList.remove('show'); }, 2500);
}

function setStatus(name, ok, text) {
  document.getElementById('dot-' + name).className = 'dot ' + (ok ? 'ok' : 'bad');
  document.getElementById('txt-' + name).textContent = text;
}

function bindSettings() {
  document.querySelectorAll('.seg[data-setting]').forEach(function (seg) {
    var key = seg.dataset.setting;
    var buttons = seg.querySelectorAll('button');
    function render() {
      buttons.forEach(function (b) { b.classList.toggle('on', b.dataset.value === String(settings[key])); });
    }
    buttons.forEach(function (b) {
      b.addEventListener('click', function () { settings[key] = b.dataset.value; saveSettings(key); render(); });
    });
    render();
  });

  document.querySelectorAll('input[type=range][data-setting]').forEach(function (input) {
    var key = input.dataset.setting;
    var out = document.getElementById('val-' + key);
    input.value = settings[key];
    out.textContent = settings[key];
    input.addEventListener('input', function () { out.textContent = input.value; });
    input.addEventListener('change', function () {
      settings[key] = Number(input.value);
      saveSettings(key);
    });
  });

  document.querySelectorAll('input[type=checkbox][data-setting]').forEach(function (input) {
    var key = input.dataset.setting;
    input.checked = !!settings[key];
    input.addEventListener('change', function () { settings[key] = input.checked; saveSettings(key); });
  });
}

function checkPremiere() {
  if (busy) return;
  Premiere.call('getSequenceInfo', [], function (err, info) {
    sequenceInfo = err ? null : info;
    if (err) return setStatus('premiere', false, 'אין חיבור לפרמייר');
    if (!info.sequence) return setStatus('premiere', false, 'פתח סיקוונס בטיימליין');
    var text = 'סיקוונס: ' + info.sequence;
    if (info.hasInOut) text += '  ·  In/Out: ' + formatTime(info.inPoint) + ' – ' + formatTime(info.outPoint);
    setStatus('premiere', true, text);
  });
}

// Returns true when Whisper and the model for the current language are ready.
function checkWhisper() {
  var downloadBtn = document.getElementById('btn-download');
  downloadBtn.hidden = true;
  var unsupported = Platform.unsupportedReason();
  if (unsupported) return setStatus('whisper', false, unsupported), false;
  if (!fs.existsSync(Platform.WHISPER_BIN)) return setStatus('whisper', false, 'Whisper חסר. התקן מחדש את התוסף'), false;
  var model = Platform.model(settings.language);
  if (!fs.existsSync(model.path)) {
    setStatus('whisper', false, 'צריך להוריד את המודל ' + model.name + ' (1.6GB, פעם אחת)');
    downloadBtn.hidden = false;
    return false;
  }
  setStatus('whisper', true, 'מודל: ' + model.name);
  return true;
}

function downloadModel() {
  if (busy) return;
  var model = Platform.model(settings.language);
  setBusy(true);
  setProgress(0, 'מוריד את ' + model.name + '…');
  Platform.downloadModel(model, function (pct, received, total) {
    setProgress(pct, 'מוריד את ' + model.name + '… ' + pct + '% (' + (received / 1e9).toFixed(2) + ' / ' + (total / 1e9).toFixed(2) + ' GB)');
  }, function (err) {
    if (err) return fail(err);
    setBusy(false);
    setProgress(null);
    checkWhisper();
    toast('המודל הורד. אפשר לתמלל');
  });
}

function formatTime(sec) {
  var m = Math.floor(sec / 60);
  var s = (sec % 60).toFixed(1);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

document.getElementById('btn-transcribe').addEventListener('click', transcribe);
document.getElementById('btn-improve').addEventListener('click', improve);
document.getElementById('btn-apply').addEventListener('click', applyToPremiere);
document.getElementById('btn-download').addEventListener('click', downloadModel);

Editor.init({ state: state, settings: settings, onSeek: seek });
bindSettings();
bindAiSettings();
Platform.prepareBinary();
checkWhisper();
checkPremiere();
setInterval(checkPremiere, 3000);
