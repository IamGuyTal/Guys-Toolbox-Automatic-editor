// ExtendScript side: runs inside Premiere. Every function returns a JSON string.

var TICKS_PER_SECOND = 254016000000;

function toJSON(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') {
    return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
  }
  if (v instanceof Array) {
    var items = [];
    for (var i = 0; i < v.length; i++) items.push(toJSON(v[i]));
    return '[' + items.join(',') + ']';
  }
  var parts = [];
  for (var k in v) if (v.hasOwnProperty(k)) parts.push(toJSON(k) + ':' + toJSON(v[k]));
  return '{' + parts.join(',') + '}';
}

function getSequenceInfo() {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return toJSON({ sequence: null });
    var end = Number(seq.end) / TICKS_PER_SECOND;
    var inPoint = seq.getInPointAsTime().seconds;
    var outPoint = seq.getOutPointAsTime().seconds;
    var hasInOut = inPoint > 0.001 || (outPoint > 0 && outPoint < end - 0.001);
    return toJSON({
      sequence: seq.name,
      id: seq.sequenceID,
      duration: end,
      inPoint: inPoint,
      outPoint: outPoint,
      hasInOut: hasInOut
    });
  } catch (e) {
    return toJSON({ error: String(e) });
  }
}

function setPlayhead(seconds) {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return toJSON({ error: 'No active sequence' });
    seq.setPlayerPosition(String(Math.round(seconds * TICKS_PER_SECOND)));
    return toJSON({ ok: true });
  } catch (e) {
    return toJSON({ error: String(e) });
  }
}

function getProjectPath() {
  try {
    return toJSON({ path: app.project.path || '' });
  } catch (e) {
    return toJSON({ error: String(e) });
  }
}

function findBin(parent, name) {
  for (var i = 0; i < parent.children.numItems; i++) {
    var child = parent.children[i];
    if (child.type === ProjectItemType.BIN && child.name === name) return child;
  }
  return parent.createBin(name);
}

function findItemByPath(bin, mediaPath) {
  for (var i = bin.children.numItems - 1; i >= 0; i--) {
    var item = bin.children[i];
    try {
      if (item.getMediaPath() === mediaPath) return item;
    } catch (e) {}
  }
  return null;
}

// Imports an SRT file into a "Captions" bin and adds it to the active sequence as a caption track.
function addCaptionTrack(srtPath) {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return toJSON({ error: 'No active sequence' });
    var bin = findBin(app.project.rootItem, 'Captions');
    if (!app.project.importFiles([srtPath], true, bin, false)) return toJSON({ error: 'SRT import failed' });
    var item = findItemByPath(bin, srtPath);
    if (!item) return toJSON({ error: 'Imported captions not found in project' });
    var ok = (typeof Sequence !== 'undefined' && Sequence.CAPTION_FORMAT_SUBTITLE !== undefined)
      ? seq.createCaptionTrack(item, 0, Sequence.CAPTION_FORMAT_SUBTITLE)
      : seq.createCaptionTrack(item, 0);
    if (ok === false) return toJSON({ error: 'createCaptionTrack failed' });
    return toJSON({ ok: true, item: item.name });
  } catch (e) {
    return toJSON({ error: String(e) });
  }
}

// Renders the active sequence's mixed audio to a WAV file.
// useInOut: true = only In→Out, false = whole sequence.
function exportAudio(outPath, presetPath, useInOut) {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return toJSON({ error: 'No active sequence' });
    var ENCODE_ENTIRE = 0, ENCODE_IN_TO_OUT = 1;
    var ok = seq.exportAsMediaDirect(outPath, presetPath, useInOut ? ENCODE_IN_TO_OUT : ENCODE_ENTIRE);
    return toJSON({ ok: ok !== false, offset: useInOut ? seq.getInPointAsTime().seconds : 0 });
  } catch (e) {
    return toJSON({ error: String(e) });
  }
}

// ---- Silence removal ----

function allTracks(seq) {
  var tracks = [];
  for (var v = 0; v < seq.videoTracks.numTracks; v++) tracks.push({ track: seq.videoTracks[v], kind: 'video', index: v });
  for (var a = 0; a < seq.audioTracks.numTracks; a++) tracks.push({ track: seq.audioTracks[a], kind: 'audio', index: a });
  return tracks;
}

// Index of the last clip that starts at or before `ticks` (clips are in timeline order).
function clipIndexAt(track, ticks) {
  var lo = 0, hi = track.clips.numItems - 1, found = -1;
  while (lo <= hi) {
    var mid = (lo + hi) >> 1;
    if (Number(track.clips[mid].start.ticks) <= ticks) { found = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return found;
}

function hasClipsAfter(track, ticks) {
  var n = track.clips.numItems;
  return n > 0 && Number(track.clips[n - 1].end.ticks) > ticks;
}

// Clips lying fully inside [a, b] (after razoring at a and b).
function clipsInside(track, a, b, tol) {
  var out = [];
  var i = clipIndexAt(track, a + tol);
  if (i < 0) i = 0;
  for (; i < track.clips.numItems; i++) {
    var c = track.clips[i];
    var s = Number(c.start.ticks), e = Number(c.end.ticks);
    if (s >= b - tol) break;
    if (s >= a - tol && e <= b + tol) out.push({ clip: c, start: s, end: e, inPoint: Number(c.inPoint.ticks) });
  }
  return out;
}

// Cuts tracks at exact frames with QE's razor. The razor reads its time string in the
// sequence's timecode display format, which can disagree with the real frame rate (e.g.
// variable-frame-rate footage with a custom display); switching the display to plain frame
// numbers while cutting makes the string unambiguous. Call restore() when done.
var FRAMES_DISPLAY = 109;

function FrameRazor(seq) {
  app.enableQE();
  this.seq = seq;
  this.qeSeq = qe.project.getActiveSequence();
  var settings = seq.getSettings();
  this.originalFormat = settings.videoDisplayFormat;
  if (this.originalFormat !== FRAMES_DISPLAY) {
    settings.videoDisplayFormat = FRAMES_DISPLAY;
    seq.setSettings(settings);
  }
  this.frameRate = seq.getSettings().videoFrameRate;
  this.zero = Number(seq.zeroPoint);
  this.tol = Number(seq.timebase) / 2;
  // Whether the razor counts from the sequence's start timecode; checked on the first cut.
  this.useZero = false;
  this.checked = this.zero === 0;
}

FrameRazor.prototype.label = function (ticks) {
  var t = new Time();
  t.ticks = String(ticks + (this.useZero ? this.zero : 0));
  return t.getFormatted(this.frameRate, FRAMES_DISPLAY);
};

// t: { track, kind: 'video' | 'audio', index }
FrameRazor.prototype.cut = function (t, ticks) {
  if (t.track.clips.numItems === 0) return;
  var qeTrack = t.kind === 'video' ? this.qeSeq.getVideoTrackAt(t.index) : this.qeSeq.getAudioTrackAt(t.index);
  qeTrack.razor(this.label(ticks));
  if (this.checked) return;
  this.checked = true;
  var i = clipIndexAt(t.track, ticks + this.tol);
  if (i >= 0 && Math.abs(Number(t.track.clips[i].start.ticks) - ticks) > this.tol) {
    this.useZero = !this.useZero;
    qeTrack.razor(this.label(ticks));
  }
};

FrameRazor.prototype.restore = function () {
  if (this.originalFormat === FRAMES_DISPLAY) return;
  var settings = this.seq.getSettings();
  settings.videoDisplayFormat = this.originalFormat;
  this.seq.setSettings(settings);
};

function checkSilenceCut() {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return toJSON({ error: 'No active sequence' });
    var locked = [];
    var tracks = allTracks(seq);
    for (var i = 0; i < tracks.length; i++) {
      if (tracks[i].track.isLocked()) locked.push((tracks[i].kind === 'video' ? 'V' : 'A') + (tracks[i].index + 1));
    }
    return toJSON({ locked: locked });
  } catch (e) {
    return toJSON({ error: String(e) });
  }
}

// Ripple-deletes each range (seconds, sequence time) on all tracks of the active sequence.
// The panel first makes a copy (copyActiveSequence / openCopy) and cuts the copy.
// A range is skipped if deleting it would leave any track out of sync.
function cutSilences(ranges) {
  var razor = null;
  try {
    var seq = app.project.activeSequence;
    if (!seq) return toJSON({ error: 'No active sequence' });
    var tpf = Number(seq.timebase);
    var tol = tpf / 2;
    var tracks = allTracks(seq);
    razor = new FrameRazor(seq);

    function snap(sec) { return Math.round(sec * TICKS_PER_SECOND / tpf) * tpf; }

    ranges.sort(function (x, y) { return y.start - x.start; });
    var done = 0, skipped = 0, removed = 0;

    for (var r = 0; r < ranges.length; r++) {
      var a = snap(ranges[r].start), b = snap(ranges[r].end);
      if (b - a < tpf) continue;

      for (var i = 0; i < tracks.length; i++) {
        razor.cut(tracks[i], a);
        razor.cut(tracks[i], b);
      }

      // Every track with material after the range must be fully covered inside it, or ripple would desync it.
      var plan = [], safe = true;
      for (var j = 0; j < tracks.length; j++) {
        var inside = clipsInside(tracks[j].track, a, b, tol);
        var covered = 0;
        for (var k = 0; k < inside.length; k++) covered += inside[k].end - inside[k].start;
        if (hasClipsAfter(tracks[j].track, b) && Math.abs(covered - (b - a)) > tol) { safe = false; break; }
        plan.push({ track: tracks[j], clips: inside });
      }
      if (!safe) { skipped++; continue; }

      for (var q = 0; q < plan.length; q++) {
        for (var m = plan[q].clips.length - 1; m >= 0; m--) {
          var want = plan[q].clips[m];
          // Re-find the clip: removing a linked clip may already have removed (and rippled) this one.
          var still = clipsInside(plan[q].track.track, want.start, want.end, tol);
          for (var z = 0; z < still.length; z++) {
            if (Math.abs(still[z].inPoint - want.inPoint) <= tol) { still[z].clip.remove(true, true); removed++; break; }
          }
        }
      }
      done++;
    }

    razor.restore();
    return toJSON({ ok: true, cut: done, skipped: skipped, removedClips: removed, name: seq.name });
  } catch (e) {
    try { if (razor) razor.restore(); } catch (e2) {}
    return toJSON({ error: String(e) + (e.line ? ' (line ' + e.line + ')' : '') });
  }
}

// Starts copying the active sequence. Premiere adds the copy ("<name> Copy") only after
// this script returns, so the panel then polls openCopy().
function copyActiveSequence() {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return toJSON({ error: 'No active sequence' });
    seq.clone();
    return toJSON({ id: seq.sequenceID, name: seq.name });
  } catch (e) {
    return toJSON({ error: String(e) });
  }
}

// Finds the copy of a sequence, renames it and makes it the active sequence.
function openCopy(originalId, originalName, newName) {
  try {
    var copy = null;
    for (var i = app.project.sequences.numSequences - 1; i >= 0; i--) {
      var s = app.project.sequences[i];
      if (s.sequenceID !== originalId && s.name === originalName + ' Copy') { copy = s; break; }
    }
    if (!copy) return toJSON({ ready: false });
    copy.name = newName;
    app.project.openSequence(copy.sequenceID);
    var active = app.project.activeSequence;
    return toJSON({ ready: true, active: !!active && active.sequenceID === copy.sequenceID, name: newName, id: copy.sequenceID });
  } catch (e) {
    return toJSON({ error: String(e) });
  }
}

// Undo for a tool's working copy: deletes the copy and brings the untouched original back.
function discardCopy(originalId, copyId) {
  try {
    var original = null, copy = null;
    for (var i = 0; i < app.project.sequences.numSequences; i++) {
      var s = app.project.sequences[i];
      if (s.sequenceID === originalId) original = s;
      if (s.sequenceID === copyId) copy = s;
    }
    if (!original) return toJSON({ error: 'original-missing' });
    if (copy) app.project.deleteSequence(copy);
    app.project.openSequence(original.sequenceID);
    return toJSON({ ok: true, deleted: !!copy, original: original.name });
  } catch (e) {
    return toJSON({ error: String(e) });
  }
}

// ---- Podcast multicam ----

function getTracks() {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return toJSON({ error: 'No active sequence' });
    var out = { video: [], audio: [] };
    for (var v = 0; v < seq.videoTracks.numTracks; v++) out.video.push({ index: v, name: seq.videoTracks[v].name, clips: seq.videoTracks[v].clips.numItems });
    for (var a = 0; a < seq.audioTracks.numTracks; a++) out.audio.push({ index: a, name: seq.audioTracks[a].name, clips: seq.audioTracks[a].clips.numItems });
    return toJSON(out);
  } catch (e) {
    return toJSON({ error: String(e) });
  }
}

// Exports the sequence audio with only one audio track audible; mute states are restored after.
function exportSoloAudio(outPath, presetPath, useInOut, soloIndex) {
  var seq = app.project.activeSequence;
  if (!seq) return toJSON({ error: 'No active sequence' });
  var saved = [];
  try {
    for (var i = 0; i < seq.audioTracks.numTracks; i++) {
      saved.push(seq.audioTracks[i].isMuted());
      seq.audioTracks[i].setMute(i === soloIndex ? 0 : 1);
    }
    var ok = seq.exportAsMediaDirect(outPath, presetPath, useInOut ? 1 : 0);
    return toJSON({ ok: ok !== false, offset: useInOut ? seq.getInPointAsTime().seconds : 0 });
  } catch (e) {
    return toJSON({ error: String(e) });
  } finally {
    for (var j = 0; j < saved.length; j++) {
      try { seq.audioTracks[j].setMute(saved[j] ? 1 : 0); } catch (e2) {}
    }
  }
}

// Cuts the camera tracks at every shot change and leaves only the chosen camera enabled in each shot.
// shots: [{start, end, camera}] in sequence seconds; cameras: video track indexes involved.
function applyMulticam(shots, cameras) {
  var razor = null;
  try {
    var seq = app.project.activeSequence;
    if (!seq) return toJSON({ error: 'No active sequence' });
    var tpf = Number(seq.timebase);
    razor = new FrameRazor(seq);

    function snap(sec) { return Math.round(sec * TICKS_PER_SECOND / tpf) * tpf; }

    // Shot boundaries in ticks, including the outer edges (for an In/Out range).
    var cuts = [];
    for (var i = 0; i < shots.length; i++) {
      shots[i].a = snap(shots[i].start);
      shots[i].b = snap(shots[i].end);
      cuts.push(shots[i].a);
    }
    cuts.push(shots[shots.length - 1].b);

    for (var c = 0; c < cameras.length; c++) {
      var cam = { track: seq.videoTracks[cameras[c]], kind: 'video', index: cameras[c] };
      if (!cam.track) continue;
      for (var k = 0; k < cuts.length; k++) razor.cut(cam, cuts[k]);
    }
    razor.restore();

    // Enable each camera clip only where its shot is on air.
    var changed = 0;
    for (var t2 = 0; t2 < cameras.length; t2++) {
      var tr = seq.videoTracks[cameras[t2]];
      if (!tr) continue;
      var s = 0;
      for (var n = 0; n < tr.clips.numItems; n++) {
        var clip = tr.clips[n];
        var mid = (Number(clip.start.ticks) + Number(clip.end.ticks)) / 2;
        while (s < shots.length - 1 && shots[s].b <= mid) s++;
        if (mid < shots[0].a || mid > shots[shots.length - 1].b) continue; // outside the analysed range
        var onAir = shots[s].camera === cameras[t2];
        if (clip.disabled !== !onAir) { clip.disabled = !onAir; changed++; }
      }
    }
    return toJSON({ ok: true, shots: shots.length, changed: changed });
  } catch (e) {
    try { if (razor) razor.restore(); } catch (e2) {}
    return toJSON({ error: String(e) + (e.line ? ' (line ' + e.line + ')' : '') });
  }
}

// ---- Reels ----

function findSequence(id) {
  for (var i = 0; i < app.project.sequences.numSequences; i++) {
    if (app.project.sequences[i].sequenceID === id) return app.project.sequences[i];
  }
  return null;
}

function removeAllClips(seq) {
  var tracks = allTracks(seq);
  for (var t = 0; t < tracks.length; t++) {
    for (var i = tracks[t].track.clips.numItems - 1; i >= 0; i--) tracks[t].track.clips[i].remove(false, false);
  }
}

// Pieces of a track's clips covering [a, b] (ticks, sequence time), with the matching media times.
function mediaPieces(track, a, b) {
  var out = [];
  for (var i = 0; i < track.clips.numItems; i++) {
    var c = track.clips[i];
    var cs = Number(c.start.ticks), ce = Number(c.end.ticks);
    if (ce <= a || cs >= b) continue;
    var s = Math.max(a, cs), e = Math.min(b, ce);
    var mediaIn = Number(c.inPoint.ticks) + (s - cs);
    out.push({ item: c.projectItem, at: s - a, mediaIn: mediaIn, mediaOut: mediaIn + (e - s) });
  }
  return out;
}

function placePiece(track, p, atTicks, mediaType) {
  p.item.setInPoint(String(p.mediaIn), mediaType);
  p.item.setOutPoint(String(p.mediaOut), mediaType);
  track.overwriteClip(p.item, String(atTicks + p.at));
}

// Builds a new sequence in a bin from pieces of the source sequence, in the given order.
// segments: [{start, end, camera}] in source-sequence seconds.
// With `audioTracks` (the source's mic tracks) and a camera per segment, the reel is built from
// the media itself: the chosen camera on V1 and every mic on its own audio track.
// Otherwise the source is nested, so edits inside it (e.g. camera switches) carry over.
// vertical: make the reel 9:16 when the source is landscape.
function createReel(sourceId, name, segments, vertical, binName, audioTracks) {
  var touched = [];
  try {
    var src = findSequence(sourceId);
    if (!src) return toJSON({ error: 'The source sequence is no longer in the project' });
    var bin = findBin(app.project.rootItem, binName || 'Reels');
    var reel = app.project.createNewSequenceFromClips(name, [src.projectItem], bin);
    if (!reel) return toJSON({ error: 'Could not create the reel sequence' });
    removeAllClips(reel);

    var tpf = Number(src.timebase);
    function snap(sec) { return Math.round(sec * TICKS_PER_SECOND / tpf) * tpf; }
    // In/out is set for all media types so a camera clip's linked audio is cut to the same
    // length; the mic tracks are then overwritten on top of it.
    var ALL_MEDIA = 4;
    var fromMedia = audioTracks && audioTracks.length && segments.length && segments[0].camera != null;
    var at = 0;

    for (var i = 0; i < segments.length; i++) {
      var a = snap(segments[i].start), b = snap(segments[i].end);
      if (b - a < tpf) continue;
      if (fromMedia) {
        var cam = src.videoTracks[segments[i].camera];
        var vp = cam ? mediaPieces(cam, a, b) : [];
        for (var v = 0; v < vp.length; v++) { placePiece(reel.videoTracks[0], vp[v], at, ALL_MEDIA); touched.push(vp[v].item); }
        for (var m = 0; m < audioTracks.length; m++) {
          var srcAudio = src.audioTracks[audioTracks[m]];
          var dest = reel.audioTracks[m];
          if (!srcAudio || !dest) continue;
          var ap = mediaPieces(srcAudio, a, b);
          for (var k = 0; k < ap.length; k++) { placePiece(dest, ap[k], at, ALL_MEDIA); touched.push(ap[k].item); }
        }
      } else {
        var item = src.projectItem;
        item.setInPoint(String(a), ALL_MEDIA);
        item.setOutPoint(String(b), ALL_MEDIA);
        reel.videoTracks[0].overwriteClip(item, String(at));
        touched.push(item);
      }
      at += b - a;
    }
    clearInOut(touched);
    // A camera file placed on an audio track brings its video along onto another video track;
    // keep only the chosen camera (V1).
    if (fromMedia) {
      for (var t = 1; t < reel.videoTracks.numTracks; t++) {
        for (var c = reel.videoTracks[t].clips.numItems - 1; c >= 0; c--) reel.videoTracks[t].clips[c].remove(false, false);
      }
    }

    if (vertical) {
      var st = reel.getSettings();
      if (st.videoFrameWidth > st.videoFrameHeight) {
        var h = st.videoFrameHeight;
        st.videoFrameWidth = 1080;
        st.videoFrameHeight = 1920;
        reel.setSettings(st);
        fillFrame(reel, 1920 / h * 100);
      }
    }
    return toJSON({ ok: true, name: reel.name, id: reel.sequenceID, clips: reel.videoTracks[0].clips.numItems, length: Number(reel.end) / TICKS_PER_SECOND, expected: at / TICKS_PER_SECOND });
  } catch (e) {
    clearInOut(touched);
    return toJSON({ error: String(e) + (e.line ? ' (line ' + e.line + ')' : '') });
  }
}

function clearInOut(items) {
  for (var i = 0; i < items.length; i++) {
    try { items[i].clearInPoint(); items[i].clearOutPoint(); } catch (e) {}
  }
}

// Scales every video clip so a landscape source fills a vertical frame (centred crop).
function fillFrame(seq, scale) {
  for (var t = 0; t < seq.videoTracks.numTracks; t++) {
    var track = seq.videoTracks[t];
    for (var i = 0; i < track.clips.numItems; i++) {
      var comps = track.clips[i].components;
      for (var c = 0; c < comps.numItems; c++) {
        if (comps[c].displayName !== 'Motion') continue;
        var props = comps[c].properties;
        for (var p = 0; p < props.numItems; p++) {
          if (props[p].displayName === 'Scale') props[p].setValue(scale, true);
        }
      }
    }
  }
}
