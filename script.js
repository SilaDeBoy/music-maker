// ======================
// Audio Context & Setup
// ======================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const masterGain = audioCtx.createGain();
masterGain.gain.value = 0.4;
masterGain.connect(audioCtx.destination);

// For recording
let mediaRecorder = null;
let recordedChunks = [];
let dest = null;

// ======================
// UI Elements
// ======================
const waveformSelect = document.getElementById("waveform");
const volumeSlider = document.getElementById("volume");
const attackSlider = document.getElementById("attack");
const releaseSlider = document.getElementById("release");
const pianoEl = document.getElementById("piano");
const sequencerEl = document.getElementById("sequencer");
const playSeqBtn = document.getElementById("playSeq");
const stopSeqBtn = document.getElementById("stopSeq");
const tempoSlider = document.getElementById("tempo");
const tempoValue = document.getElementById("tempoValue");
const startRecordBtn = document.getElementById("startRecord");
const stopRecordBtn = document.getElementById("stopRecord");
const downloadLink = document.getElementById("downloadLink");
const recordStatus = document.getElementById("recordStatus");

// ======================
// Piano Notes
// ======================
const whiteNotes = [
  { note: "C4", freq: 261.63, key: "a" },
  { note: "D4", freq: 293.66, key: "s" },
  { note: "E4", freq: 329.63, key: "d" },
  { note: "F4", freq: 349.23, key: "f" },
  { note: "G4", freq: 392.00, key: "g" },
  { note: "A4", freq: 440.00, key: "h" },
  { note: "B4", freq: 493.88, key: "j" },
  { note: "C5", freq: 523.25, key: "k" },
];

const blackNotes = [
  { note: "C#4", freq: 277.18, key: "w", after: 0 },
  { note: "D#4", freq: 311.13, key: "e", after: 1 },
  { note: "F#4", freq: 369.99, key: "t", after: 3 },
  { note: "G#4", freq: 415.30, key: "y", after: 4 },
  { note: "A#4", freq: 466.16, key: "u", after: 5 },
];

const activeOscillators = new Map();

function playNote(freq, noteId) {
  if (audioCtx.state === "suspended") audioCtx.resume();

  // Stop previous if still playing the same note
  if (activeOscillators.has(noteId)) {
    stopNote(noteId);
  }

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = waveformSelect.value;
  osc.frequency.value = freq;

  const now = audioCtx.currentTime;
  const attack = parseFloat(attackSlider.value);
  const release = parseFloat(releaseSlider.value);
  const vol = parseFloat(volumeSlider.value);

  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(vol, now + attack);

  osc.connect(gain);
  gain.connect(masterGain);
  if (dest) gain.connect(dest); // for recording

  osc.start(now);

  activeOscillators.set(noteId, { osc, gain, release });
}

function stopNote(noteId) {
  const entry = activeOscillators.get(noteId);
  if (!entry) return;

  const { osc, gain, release } = entry;
  const now = audioCtx.currentTime;

  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + release);

  osc.stop(now + release + 0.05);
  activeOscillators.delete(noteId);
}

// Build piano UI
function buildPiano() {
  pianoEl.innerHTML = "";

  // White keys
  whiteNotes.forEach((n, i) => {
    const key = document.createElement("div");
    key.className = "key white";
    key.dataset.note = n.note;
    key.dataset.freq = n.freq;
    key.textContent = n.key.toUpperCase();
    key.addEventListener("mousedown", () => {
      key.classList.add("active");
      playNote(n.freq, n.note);
    });
    key.addEventListener("mouseup", () => {
      key.classList.remove("active");
      stopNote(n.note);
    });
    key.addEventListener("mouseleave", () => {
      key.classList.remove("active");
      stopNote(n.note);
    });
    pianoEl.appendChild(key);
  });

  // Black keys (positioned absolutely)
  const whiteWidth = 50; // approx width + margin
  blackNotes.forEach((n) => {
    const key = document.createElement("div");
    key.className = "key black";
    key.dataset.note = n.note;
    key.dataset.freq = n.freq;
    key.textContent = n.key.toUpperCase();
    key.style.left = `${(n.after + 1) * whiteWidth - 15}px`;
    key.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      key.classList.add("active");
      playNote(n.freq, n.note);
    });
    key.addEventListener("mouseup", () => {
      key.classList.remove("active");
      stopNote(n.note);
    });
    key.addEventListener("mouseleave", () => {
      key.classList.remove("active");
      stopNote(n.note);
    });
    pianoEl.appendChild(key);
  });
}

// Keyboard support
const keyMap = {};
[...whiteNotes, ...blackNotes].forEach((n) => {
  keyMap[n.key] = n;
});

document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const note = keyMap[e.key.toLowerCase()];
  if (note) {
    const el = document.querySelector(`[data-note="${note.note}"]`);
    if (el) el.classList.add("active");
    playNote(note.freq, note.note);
  }
});

document.addEventListener("keyup", (e) => {
  const note = keyMap[e.key.toLowerCase()];
  if (note) {
    const el = document.querySelector(`[data-note="${note.note}"]`);
    if (el) el.classList.remove("active");
    stopNote(note.note);
  }
});

// Volume
volumeSlider.addEventListener("input", () => {
  masterGain.gain.value = parseFloat(volumeSlider.value);
});

// ======================
// Drum Sequencer
// ======================
const drumSounds = {
  kick: { type: "kick" },
  snare: { type: "snare" },
  hihat: { type: "hihat" },
};

const stepsCount = 8;
const pattern = {
  kick:  Array(stepsCount).fill(false),
  snare: Array(stepsCount).fill(false),
  hihat: Array(stepsCount).fill(false),
};

// Default pattern
pattern.kick[0] = true;
pattern.kick[4] = true;
pattern.snare[2] = true;
pattern.snare[6] = true;
pattern.hihat[0] = true;
pattern.hihat[1] = true;
pattern.hihat[2] = true;
pattern.hihat[3] = true;
pattern.hihat[4] = true;
pattern.hihat[5] = true;
pattern.hihat[6] = true;
pattern.hihat[7] = true;

let isPlaying = false;
let currentStep = 0;
let timerId = null;

function playDrum(type) {
  if (audioCtx.state === "suspended") audioCtx.resume();

  const now = audioCtx.currentTime;

  if (type === "kick") {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
    gain.gain.setValueAtTime(0.9, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(gain);
    gain.connect(masterGain);
    if (dest) gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.3);
  } else if (type === "snare") {
    // Noise
    const bufferSize = audioCtx.sampleRate * 0.2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = "highpass";
    noiseFilter.frequency.value = 1000;
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.6, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    if (dest) noiseGain.connect(dest);
    noise.start(now);

    // Tone
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 180;
    oscGain.gain.setValueAtTime(0.4, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(oscGain);
    oscGain.connect(masterGain);
    if (dest) oscGain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.15);
  } else if (type === "hihat") {
    const bufferSize = audioCtx.sampleRate * 0.08;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    if (dest) gain.connect(dest);
    noise.start(now);
  }
}

function buildSequencer() {
  sequencerEl.innerHTML = "";
  ["kick", "snare", "hihat"].forEach((drum) => {
    const row = document.createElement("div");
    row.className = "drum-row";

    const label = document.createElement("div");
    label.className = "drum-label";
    label.textContent = drum;
    row.appendChild(label);

    const steps = document.createElement("div");
    steps.className = "steps";

    for (let i = 0; i < stepsCount; i++) {
      const step = document.createElement("div");
      step.className = "step" + (pattern[drum][i] ? " on" : "");
      step.dataset.drum = drum;
      step.dataset.step = i;
      step.addEventListener("click", () => {
        pattern[drum][i] = !pattern[drum][i];
        step.classList.toggle("on", pattern[drum][i]);
      });
      steps.appendChild(step);
    }
    row.appendChild(steps);
    sequencerEl.appendChild(row);
  });
}

function scheduler() {
  // Play current step
  ["kick", "snare", "hihat"].forEach((drum) => {
    if (pattern[drum][currentStep]) {
      playDrum(drum);
    }
  });

  // Visual
  document.querySelectorAll(".step").forEach((el) => {
    el.classList.remove("playing");
    if (parseInt(el.dataset.step) === currentStep) {
      el.classList.add("playing");
    }
  });

  currentStep = (currentStep + 1) % stepsCount;

  const bpm = parseInt(tempoSlider.value);
  const interval = (60 / bpm) * 1000 / 2; // 8th notes
  timerId = setTimeout(scheduler, interval);
}

playSeqBtn.addEventListener("click", () => {
  if (isPlaying) return;
  if (audioCtx.state === "suspended") audioCtx.resume();
  isPlaying = true;
  currentStep = 0;
  scheduler();
});

stopSeqBtn.addEventListener("click", () => {
  isPlaying = false;
  clearTimeout(timerId);
  document.querySelectorAll(".step").forEach((el) => el.classList.remove("playing"));
});

tempoSlider.addEventListener("input", () => {
  tempoValue.textContent = tempoSlider.value;
});

// ======================
// Recording
// ======================
startRecordBtn.addEventListener("click", async () => {
  if (audioCtx.state === "suspended") await audioCtx.resume();

  dest = audioCtx.createMediaStreamDestination();
  masterGain.connect(dest);

  recordedChunks = [];
  mediaRecorder = new MediaRecorder(dest.stream);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: "audio/webm" });
    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.classList.remove("hidden");
    recordStatus.textContent = "Recording ready — click Download";
  };

  mediaRecorder.start();
  startRecordBtn.disabled = true;
  stopRecordBtn.disabled = false;
  downloadLink.classList.add("hidden");
  recordStatus.textContent = "● Recording... Play some notes or the sequencer!";
});

stopRecordBtn.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
  startRecordBtn.disabled = false;
  stopRecordBtn.disabled = true;
});

// ======================
// Init
// ======================
buildPiano();
buildSequencer();

// Resume audio on first interaction (browser policy)
document.body.addEventListener(
  "click",
  () => {
    if (audioCtx.state === "suspended") audioCtx.resume();
  },
  { once: true }
);
