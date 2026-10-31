// Audio export + Whisper transcription. Produces a flat list of words:
// [{ text, start, end }] with times in seconds relative to the exported audio.

var Transcriber = (function () {
  var fs = require('fs');
  var os = require('os');
  var path = require('path');
  var spawn = require('child_process').spawn;

  var WORK_DIR = path.join(os.tmpdir(), 'premiere-captions');
  var presetPath = null;

  // soloTrack: export only this audio track (index), or undefined for the full mix.
  function exportAudio(useInOut, cb, soloTrack) {
    var preset = presetPath || (presetPath = Platform.findPreset());
    if (!preset) return cb(new Error('לא נמצא preset לייצוא אודיו בפרמייר'));
    fs.mkdirSync(WORK_DIR, { recursive: true });
    var wav = path.join(WORK_DIR, 'audio-' + Date.now() + '.wav');
    var call = soloTrack === undefined ? ['exportAudio', [wav, preset, useInOut]] : ['exportSoloAudio', [wav, preset, useInOut, soloTrack]];
    Premiere.call(call[0], call[1], function (err, res) {
      if (err) return cb(err);
      if (!fs.existsSync(wav)) return cb(new Error('ייצוא האודיו מפרמייר נכשל'));
      cb(null, { wav: wav, offset: res.offset });
    });
  }

  // Runs on the GPU; if that fails, retries once on the CPU.
  function runWhisper(opts, onProgress, cb) {
    runWhisperOnce(opts, true, onProgress, function (err, words) {
      if (!err) return cb(null, words);
      console.warn('Whisper GPU run failed, retrying on CPU', err);
      onProgress(0);
      runWhisperOnce(opts, false, onProgress, cb);
    });
  }

  function runWhisperOnce(opts, useGpu, onProgress, cb) {
    var outBase = opts.wav.replace(/\.wav$/, '');
    var args = [
      '-m', opts.model,
      '-f', opts.wav,
      '-l', opts.language,
      '-t', String(Math.max(4, os.cpus().length - 2)),
      '-nfa',                     // DTW word timing needs flash attention off
      '-dtw', 'large.v3.turbo',
      '-ojf', '-of', outBase,
      '-pp', '-np'
    ];
    if (!useGpu) args.push('-ng');
    // bfloat Metal shaders fail to compile on this macOS; the rest of the GPU path works.
    var env = Object.assign({}, process.env, { GGML_METAL_BF16_DISABLE: '1' });
    var proc = spawn(opts.bin, args, { env: env });
    var stderr = '';
    proc.stderr.on('data', function (d) {
      var s = d.toString();
      stderr += s;
      var m = s.match(/progress\s*=\s*(\d+)%/g);
      if (m) onProgress(parseInt(m[m.length - 1].replace(/\D/g, ''), 10));
    });
    proc.on('error', cb);
    proc.on('close', function (code) {
      if (code !== 0) return cb(new Error('Whisper נכשל (קוד ' + code + ')\n' + stderr.slice(-500)));
      try {
        var json = JSON.parse(fs.readFileSync(outBase + '.json', 'utf8'));
        cb(null, parseWords(json));
      } catch (e) {
        cb(e);
      }
    });
  }

  function isSpecial(tok) {
    return /^\s*(\[_|<\|)/.test(tok.text);
  }

  // Joins sub-word tokens into words. A token starting with a space opens a new word.
  // Start time comes from DTW alignment; end = next word's start (or segment end).
  function parseWords(json) {
    var words = [];
    json.transcription.forEach(function (seg) {
      var segEnd = seg.offsets.to / 1000;
      var segWords = [];
      seg.tokens.forEach(function (tok) {
        if (isSpecial(tok)) return;
        var t = tok.t_dtw >= 0 ? tok.t_dtw / 100 : tok.offsets.from / 1000;
        if (/^\s/.test(tok.text) || !segWords.length) {
          segWords.push({ text: tok.text.trim(), start: t });
        } else {
          segWords[segWords.length - 1].text += tok.text;
        }
      });
      segWords.forEach(function (w, i) {
        var next = segWords[i + 1];
        w.end = next ? next.start : Math.max(segEnd, w.start + 0.2);
        if (w.end - w.start < 0.05) w.end = w.start + 0.05;
      });
      words = words.concat(segWords.filter(function (w) { return w.text; }));
    });
    return words;
  }

  function cleanup(wav) {
    var base = wav.replace(/\.wav$/, '');
    [wav, base + '.json'].forEach(function (f) { try { fs.unlinkSync(f); } catch (e) {} });
  }

  return { exportAudio: exportAudio, runWhisper: runWhisper, parseWords: parseWords, cleanup: cleanup };
})();
