// Everything that differs between Mac and Windows: Whisper binary, model folder,
// Premiere's export preset, and downloading models on first use.

var Platform = (function () {
  var fs = require('fs');
  var os = require('os');
  var path = require('path');
  var url = require('url');

  var EXT_ROOT = path.dirname(url.fileURLToPath(location.href));
  var IS_WIN = process.platform === 'win32';
  var IS_MAC = process.platform === 'darwin';

  var PLATFORM_DIR = IS_MAC && process.arch === 'arm64' ? 'mac-arm64'
    : IS_WIN && process.arch === 'x64' ? 'win-x64'
    : IS_WIN && process.arch === 'arm64' ? 'win-arm64'
    : null;

  var WHISPER_BIN = PLATFORM_DIR && path.join(EXT_ROOT, 'bin', PLATFORM_DIR, IS_WIN ? 'whisper-cli.exe' : 'whisper-cli');

  var DATA_DIR = IS_WIN
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'PremiereCaptions')
    : path.join(os.homedir(), 'Library', 'Application Support', 'PremiereCaptions');
  var MODELS_DIR = path.join(DATA_DIR, 'models');

  // Hebrew uses the ivrit.ai fine-tune; it translates other languages into Hebrew,
  // so English and auto-detect use the standard multilingual model.
  var MODEL_FILES = {
    ivrit: {
      file: 'ivrit-large-v3-turbo.bin',
      url: 'https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ggml/resolve/main/ggml-model.bin',
      name: 'ivrit.ai (עברית)'
    },
    standard: {
      file: 'large-v3-turbo.bin',
      url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
      name: 'Whisper large-v3-turbo'
    }
  };
  var MODEL_FOR_LANGUAGE = { he: 'ivrit', en: 'standard', auto: 'standard' };

  function model(language) {
    var m = MODEL_FILES[MODEL_FOR_LANGUAGE[language]];
    return { name: m.name, url: m.url, path: path.join(MODELS_DIR, m.file) };
  }

  function unsupportedReason() {
    if (PLATFORM_DIR) return null;
    if (IS_MAC) return 'מק עם מעבד Intel עדיין לא נתמך';
    return 'המערכת הזו לא נתמכת';
  }

  // ZXP installs may drop the executable bit or keep macOS quarantine on the binary.
  function prepareBinary() {
    if (!IS_MAC || !WHISPER_BIN || !fs.existsSync(WHISPER_BIN)) return;
    try { fs.chmodSync(WHISPER_BIN, 0o755); } catch (e) {}
    try { require('child_process').spawnSync('xattr', ['-dr', 'com.apple.quarantine', path.dirname(WHISPER_BIN)]); } catch (e) {}
  }

  // Looks for Premiere's built-in 16 kHz mono WAV preset inside the Premiere install.
  var PRESET_NAME = 'WAV_Mono_16bit_16kHz.epr';

  function findPreset() {
    var roots = IS_WIN
      ? [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Adobe')]
      : ['/Applications'];
    for (var i = 0; i < roots.length; i++) {
      var installs;
      try { installs = fs.readdirSync(roots[i]).filter(function (n) { return /^Adobe Premiere Pro/.test(n); }); } catch (e) { continue; }
      installs.sort().reverse();
      for (var j = 0; j < installs.length; j++) {
        var found = findFile(path.join(roots[i], installs[j]), PRESET_NAME, 5);
        if (found) return found;
      }
    }
    return null;
  }

  function findFile(dir, name, depth) {
    var entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return null; }
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].isFile() && entries[i].name === name) return path.join(dir, name);
    }
    if (depth <= 0) return null;
    // Search the likely folders first to keep this fast.
    entries.sort(function (a, b) { return score(b.name) - score(a.name); });
    for (var k = 0; k < entries.length; k++) {
      if (!entries[k].isDirectory()) continue;
      var hit = findFile(path.join(dir, entries[k].name), name, depth - 1);
      if (hit) return hit;
    }
    return null;
  }

  function score(name) {
    return /EncoderPresets/.test(name) ? 3 : /Settings/.test(name) ? 2 : /Contents|\.app$/.test(name) ? 1 : 0;
  }

  // Downloads a model with progress, following redirects. Writes to .part first.
  function downloadModel(m, onProgress, cb) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
    var tmp = m.path + '.part';
    var https = require('https');

    function get(link, redirects) {
      https.get(link, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 10) {
          res.resume();
          return get(new URL(res.headers.location, link).toString(), redirects + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return cb(new Error('הורדת המודל נכשלה (' + res.statusCode + ')'));
        }
        var total = Number(res.headers['content-length']) || 0;
        var received = 0;
        var out = fs.createWriteStream(tmp);
        res.on('data', function (chunk) {
          received += chunk.length;
          if (total) onProgress(Math.floor(received / total * 100), received, total);
        });
        res.pipe(out);
        out.on('finish', function () {
          if (total && received !== total) return cb(new Error('ההורדה נקטעה. נסה שוב'));
          fs.renameSync(tmp, m.path);
          cb(null);
        });
        res.on('error', function () { cb(new Error('ההורדה נקטעה. נסה שוב')); });
      }).on('error', function () { cb(new Error('אין חיבור לאינטרנט')); });
    }
    get(m.url, 0);
  }

  return {
    EXT_ROOT: EXT_ROOT,
    WHISPER_BIN: WHISPER_BIN,
    MODELS_DIR: MODELS_DIR,
    model: model,
    unsupportedReason: unsupportedReason,
    prepareBinary: prepareBinary,
    findPreset: findPreset,
    downloadModel: downloadModel
  };
})();
