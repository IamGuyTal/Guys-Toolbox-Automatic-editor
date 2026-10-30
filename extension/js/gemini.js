// Gemini API client for the "improve with AI" pass.
// Proofreads the transcription in context and suggests natural caption breaks.

var Gemini = (function () {
  var API = 'generativelanguage.googleapis.com';

  var REQUEST_TIMEOUT = 45000;
  var RACE_SIZE = 4;

  // Returns the request so a caller can abort it. cb is called exactly once.
  function request(method, apiPath, key, body, cb) {
    var https = require('https');
    var data = body ? JSON.stringify(body) : null;
    var finished = false;
    var done = function (err, res) {
      if (finished) return;
      finished = true;
      cb(err, res);
    };
    var req = https.request({
      host: API,
      path: apiPath,
      method: method,
      headers: Object.assign({ 'x-goog-api-key': key }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {})
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var text = Buffer.concat(chunks).toString('utf8');
        var json;
        try { json = JSON.parse(text); } catch (e) { return done(new Error('תשובה לא תקינה מ-Gemini')); }
        if (res.statusCode !== 200) return done(new Error(errorMessage(res.statusCode, json)));
        done(null, json);
      });
    });
    req.on('error', function (e) { done(new Error('אין חיבור לאינטרנט או ל-Gemini (' + (e.code || e.message) + ')')); });
    var timer = setTimeout(function () {
      done(new Error('Gemini לא ענה בזמן. ייתכן שהוא עמוס, נסה שוב בעוד דקה'));
      req.destroy();
    }, REQUEST_TIMEOUT);
    req.on('close', function () { clearTimeout(timer); });
    if (data) req.write(data);
    req.end();
    return req;
  }

  function errorMessage(status, json) {
    var msg = (json.error && json.error.message) || '';
    if (status === 400 && /API key/i.test(msg)) return 'מפתח ה-API של Gemini לא תקין';
    if (status === 403) return 'מפתח ה-API של Gemini לא מורשה';
    if (status === 429) return 'הגעת למגבלת השימוש החינמית של Gemini. נסה שוב בעוד דקה';
    if (status === 503) return 'Gemini עמוס כרגע. נסה שוב בעוד דקה';
    return 'שגיאה מ-Gemini (' + status + '): ' + msg.slice(0, 120);
  }

  // Lists the newest stable "flash" models the key can use, newest first.
  // The newest ones are sometimes overloaded on the free tier, so callers race a few.
  function listModels(key, cb) {
    request('GET', '/v1beta/models?pageSize=200', key, null, function (err, res) {
      if (err) return cb(err);
      var names = (res.models || [])
        .filter(function (m) { return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0; })
        .map(function (m) { return m.name.replace(/^models\//, ''); });
      var stable = names.filter(function (n) { return /^gemini-[\d.]+-flash$/.test(n); });
      var any = names.filter(function (n) { return /^gemini-.*flash/.test(n) && !/lite|image|tts|live|audio|embed/.test(n); });
      var pool = stable.length ? stable : any;
      if (!pool.length) return cb(new Error('לא נמצא מודל Gemini זמין למפתח הזה'));
      pool.sort(function (a, b) { return version(b) - version(a); });
      cb(null, pool.slice(0, RACE_SIZE));
    });
  }

  function version(name) {
    var m = name.match(/gemini-([\d.]+)/);
    return m ? parseFloat(m[1]) : 0;
  }

  var LANGUAGE_NAMES = { he: 'Hebrew', en: 'English', auto: 'the spoken language' };

  function buildPrompt(words, language, maxWords) {
    var list = words.map(function (w, i) { return i + ':' + w.text; }).join(' ');
    return [
      'You are proofreading an automatic speech-to-text transcription that will become video subtitles.',
      'The audio is in ' + LANGUAGE_NAMES[language] + '. Words are given as index:word.',
      '',
      'Task 1 - corrections:',
      '- Read the whole text and fix ONLY words that were clearly misrecognized: a wrong word that does not fit the context, misspellings, misheard names or terms, or one word wrongly split into two / two words wrongly merged.',
      '- Do NOT rephrase, summarize, translate, change slang or speaking style, or "improve" grammar of correct spoken language.',
      '- Each correction is {"i": index, "text": replacement}. The replacement may hold several words (if the original was a wrong merge) or be "" (to remove a wrongly duplicated or hallucinated word).',
      '- Keep punctuation as it is unless it is clearly wrong.',
      '',
      'Task 2 - subtitle breaks:',
      '- Return "breaks": the indices of words that should START a new subtitle (index 0 is implied).',
      '- Each subtitle must have at most ' + maxWords + ' words, and should read as a natural phrase: keep together a preposition and its noun, a name, a number and its unit, and short fixed expressions; start a new subtitle at sentence boundaries.',
      '- Prefer balanced subtitles; avoid a single word left alone when it can join a neighbour.',
      '',
      'Words:',
      list
    ].join('\n');
  }

  var SCHEMA = {
    type: 'OBJECT',
    properties: {
      corrections: {
        type: 'ARRAY',
        items: { type: 'OBJECT', properties: { i: { type: 'INTEGER' }, text: { type: 'STRING' } }, required: ['i', 'text'] }
      },
      breaks: { type: 'ARRAY', items: { type: 'INTEGER' } }
    },
    required: ['corrections', 'breaks']
  };

  function generate(model, opts, cb) {
    var body = {
      contents: [{ role: 'user', parts: [{ text: buildPrompt(opts.words, opts.language, opts.maxWords) }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: SCHEMA }
    };
    return request('POST', '/v1beta/models/' + model + ':generateContent', opts.key, body, function (err, res) {
      if (err) return cb(err);
      try {
        var parts = res.candidates[0].content.parts.filter(function (p) { return !p.thought; });
        var out = JSON.parse(parts.map(function (p) { return p.text; }).join(''));
        cb(null, { corrections: out.corrections || [], breaks: out.breaks || [], model: model });
      } catch (e) {
        cb(new Error('Gemini החזיר תשובה לא צפויה. נסה שוב'));
      }
    });
  }

  // Sends the request to several models at once and keeps the first good answer.
  function race(models, opts, cb) {
    var pending = models.length;
    var won = false;
    var lastErr = null;
    var reqs = models.map(function (model) {
      return generate(model, opts, function (err, result) {
        pending--;
        if (won) return;
        if (err) {
          lastErr = err;
          if (!pending) cb(lastErr);
          return;
        }
        won = true;
        reqs.forEach(function (r) { r.destroy(); });
        cb(null, result);
      });
    });
  }

  // Uses the model that worked last time; if it fails, races the newest models again.
  function improve(opts, cb) {
    function remember(err, result) {
      if (err) return cb(err);
      localStorage.setItem('geminiModel', result.model);
      cb(null, result);
    }
    function raceAll() {
      listModels(opts.key, function (err, models) {
        if (err) return cb(err);
        race(models, opts, remember);
      });
    }
    var cached = localStorage.getItem('geminiModel');
    if (!cached) return raceAll();
    generate(cached, opts, function (err, result) {
      if (!err) return cb(null, result);
      localStorage.removeItem('geminiModel');
      raceAll();
    });
  }

  return { improve: improve, buildPrompt: buildPrompt };
})();
