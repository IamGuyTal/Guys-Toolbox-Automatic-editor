// Claude API client (raw HTTPS: CEP's Node 17 can't run the official SDK).
// Same improve() interface as Gemini, plus the request's cost in dollars.

var Claude = (function () {
  var MODEL = 'claude-opus-5-5';
  // $ per million tokens for MODEL; update together with MODEL.
  var PRICE_IN = 4, PRICE_OUT = 20;
  var REQUEST_TIMEOUT = 180000;

  var SCHEMA = {
    type: 'object',
    properties: {
      corrections: {
        type: 'array',
        items: {
          type: 'object',
          properties: { i: { type: 'integer' }, text: { type: 'string' } },
          required: ['i', 'text'],
          additionalProperties: false
        }
      },
      breaks: { type: 'array', items: { type: 'integer' } }
    },
    required: ['corrections', 'breaks'],
    additionalProperties: false
  };

  function errorMessage(status, json) {
    var msg = (json && json.error && json.error.message) || '';
    if (status === 401) return 'מפתח ה-API של Claude לא תקין';
    if (status === 400 && /credit|balance/i.test(msg)) return 'נגמרו הקרדיטים בחשבון Claude';
    if (status === 429) return 'Claude: יותר מדי בקשות. נסה שוב בעוד דקה';
    if (status === 529 || status >= 500) return 'Claude עמוס כרגע. נסה שוב בעוד דקה';
    return 'שגיאה מ-Claude (' + status + '): ' + msg.slice(0, 120);
  }

  // POSTs a Messages API request; cb(err, responseJson)
  function send(key, body, cb, timeout) {
    var https = require('https');
    var data = JSON.stringify(body);
    var finished = false;
    var done = function (err, res) { if (!finished) { finished = true; cb(err, res); } };
    var req = https.request({
      host: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2026-10-21',
        // Re-runs a request on a fallback model if a safety classifier declines it.
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(data)
      }
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var json;
        try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return done(new Error('תשובה לא תקינה מ-Claude')); }
        if (res.statusCode !== 200) return done(new Error(errorMessage(res.statusCode, json)));
        done(null, json);
      });
    });
    req.on('error', function (e) { done(new Error('אין חיבור לאינטרנט או ל-Claude (' + (e.code || e.message) + ')')); });
    var timer = setTimeout(function () {
      done(new Error('Claude לא ענה בזמן. נסה שוב'));
      req.destroy();
    }, timeout || REQUEST_TIMEOUT);
    req.on('close', function () { clearTimeout(timer); });
    req.write(data);
    req.end();
  }

  function cost(usage) {
    if (!usage) return 0;
    var input = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
    return input / 1e6 * PRICE_IN + (usage.output_tokens || 0) / 1e6 * PRICE_OUT;
  }

  // Returns the first text block parsed as JSON (output_config.format guarantees valid JSON).
  function parseJson(res) {
    if (res.stop_reason === 'refusal') throw new Error('Claude סירב לבקשה');
    if (res.stop_reason === 'max_tokens') throw new Error('התשובה של Claude נקטעה. נסה קטע קצר יותר');
    var block = (res.content || []).filter(function (b) { return b.type === 'text'; })[0];
    if (!block) throw new Error('Claude החזיר תשובה ריקה');
    return JSON.parse(block.text);
  }

  function improve(opts, cb) {
    var body = {
      model: MODEL,
      max_tokens: 16000,
      fallbacks: 'default',
      // Proofreading is a light task; low effort keeps it fast and cheap.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: Gemini.buildPrompt(opts.words, opts.language, opts.maxWords) }]
    };
    send(opts.key, body, function (err, res) {
      if (err) return cb(err);
      try {
        var out = parseJson(res);
        cb(null, { corrections: out.corrections || [], breaks: out.breaks || [], model: res.model || MODEL, cost: cost(res.usage) });
      } catch (e) {
        cb(e);
      }
    });
  }

  // req: { key, prompt, schema, effort, maxTokens, timeout }; cb(err, { data, model, cost })
  function json(req, cb) {
    var body = {
      model: MODEL,
      max_tokens: req.maxTokens || 16000,
      fallbacks: 'default',
      output_config: { effort: req.effort || 'medium', format: { type: 'json_schema', schema: req.schema } },
      messages: [{ role: 'user', content: req.prompt }]
    };
    send(req.key, body, function (err, res) {
      if (err) return cb(err);
      try {
        cb(null, { data: parseJson(res), model: res.model || MODEL, cost: cost(res.usage) });
      } catch (e) {
        cb(e);
      }
    }, req.timeout);
  }

  return { MODEL: MODEL, improve: improve, json: json, cost: cost };
})();
