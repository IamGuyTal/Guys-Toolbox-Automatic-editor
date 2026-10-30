// Bridge to the ExtendScript side (jsx/host.jsx).
// Premiere.call('fnName', [args], function (err, result) {...})

var Premiere = (function () {
  function call(fn, args, cb) {
    var script = fn + '(' + args.map(function (a) { return JSON.stringify(a); }).join(',') + ')';
    window.__adobe_cep__.evalScript(script, function (raw) {
      if (raw === 'EvalScript error.' || raw === undefined) return cb(new Error('ExtendScript failed: ' + fn));
      var res;
      try { res = JSON.parse(raw); } catch (e) { return cb(new Error('Bad response from ' + fn + ': ' + raw)); }
      if (res && res.error) return cb(new Error(res.error));
      cb(null, res);
    });
  }
  return { call: call };
})();
