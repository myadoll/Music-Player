/* Sleek Music Player with Crossfade + Seek + Safari unlock + Shuffle + Markers
   Expects:
   - images/image1.jpg, image2.jpg, image3.jpg
   - music/song1.mp3, song2.mp3, song3.mp3
*/

const tracks = [
  { title: "Neon Skyline",   src: "music/song1.mp3", cover: "images/image1.jpg" },
  { title: "Midnight Drive", src: "music/song2.mp3", cover: "images/image2.jpg" },
  { title: "City Lights",    src: "music/song3.mp3", cover: "images/image3.jpg" }
];

const crossfadeMs = 1500;

let index = 0;
let isPlaying = false;
let rafId = null;
let seeking = false;
let audioUnlocked = false;
let shuffleOn = false;

const audioA = document.getElementById("audioA");
const audioB = document.getElementById("audioB");
const playPauseBtn = document.getElementById("playPauseBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const seek = document.getElementById("seek");
const curT = document.getElementById("currentTime");
const durT = document.getElementById("duration");
const art = document.getElementById("albumArt");
const titleEl = document.getElementById("trackTitle");
const indexEl = document.getElementById("trackIndex");
const markersEl = document.getElementById("markers");

let active = audioA;
let standby = audioB;

function fmt(t) {
  if (!isFinite(t)) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function setFillFromAudio(a) {
  const ratio = (a.currentTime || 0) / (a.duration || 1);
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  seek.style.setProperty("--fill", `${pct}%`);
  seek.value = Math.round(pct * 10);
}

function loadInto(audio, i) {
  const t = tracks[i];
  audio.src = t.src;
  audio.load();
}

function syncMeta(i) {
  const t = tracks[i];
  art.src = t.cover;
  titleEl.textContent = t.title;
  indexEl.textContent = `${i + 1} / ${tracks.length}`;
}

function onLoadedMeta(e) {
  if (e.target !== active) return;
  durT.textContent = fmt(active.duration);
  buildMarkers(); // refresh timestamp labels for this track
}

function unlockAudioIfNeeded() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  const prevVolA = active.volume ?? 1;
  const prevVolB = standby.volume ?? 1;
  active.volume = 0; standby.volume = 0;
  Promise.resolve()
    .then(() => active.play().catch(() => {}))
    .then(() => active.pause())
    .then(() => standby.play().catch(() => {}))
    .then(() => standby.pause())
    .finally(() => { active.volume = prevVolA; standby.volume = prevVolB; });
}

// Timestamp markers (0%, 25%, 50%, 75%, 100%)
function buildMarkers() {
  markersEl.innerHTML = "";
  const d = active.duration;
  if (!isFinite(d) || d <= 0) return;

  const points = [0, 0.25, 0.5, 0.75, 1];
  points.forEach(p => {
    const s = p * d;
    const mark = document.createElement("div");
    mark.className = "mark";
    mark.style.left = `${p * 100}%`;

    const tick = document.createElement("div");
    tick.className = "tick";

    const label = document.createElement("div");
    label.className = "label";
    label.textContent = fmt(s);

    mark.appendChild(tick);
    mark.appendChild(label);
    mark.addEventListener("click", () => {
      if (active.duration) {
        active.currentTime = s;
        setFillFromAudio(active);
      }
    });

    markersEl.appendChild(mark);
  });
}

// Shuffle toggle
shuffleBtn.addEventListener("click", () => {
  shuffleOn = !shuffleOn;
  shuffleBtn.setAttribute("aria-pressed", String(shuffleOn));
});

// Decide next/prev index
function nextIndexLinear() { return (index + 1) % tracks.length; }
function prevIndexLinear() { return (index - 1 + tracks.length) % tracks.length; }

function nextIndexShuffled() {
  if (tracks.length <= 1) return index;
  let r;
  do { r = Math.floor(Math.random() * tracks.length); } while (r === index);
  return r;
}

function prevIndexShuffled() {
  // For simplicity, also random (no strict history)
  return nextIndexShuffled();
}

function getNextIndex(direction) {
  if (!shuffleOn) return direction === "next" ? nextIndexLinear() : prevIndexLinear();
  return direction === "next" ? nextIndexShuffled() : prevIndexShuffled();
}

// Initial
loadInto(active, index);
syncMeta(index);
active.addEventListener("loadedmetadata", onLoadedMeta);

async function togglePlay() {
  unlockAudioIfNeeded();
  if (!isPlaying) {
    try {
      await active.play();
      isPlaying = true;
      document.body.classList.add("playing");
      playPauseBtn.textContent = "❚❚";
      tick();
    } catch (err) {
      console.warn("Play blocked:", err);
    }
  } else {
    active.pause();
    isPlaying = false;
    document.body.classList.remove("playing");
    playPauseBtn.textContent = "►";
    cancelAnimationFrame(rafId);
  }
}

playPauseBtn.addEventListener("click", togglePlay);
prevBtn.addEventListener("click", () => goTo("prev"));
nextBtn.addEventListener("click", () => goTo("next"));

// Also treat any click/touch as a gesture to unlock audio
["click","touchstart"].forEach(evt =>
  document.addEventListener(evt, unlockAudioIfNeeded, { once: true, passive: true })
);

function goTo(direction) {
  const targetIdx = getNextIndex(direction);
  crossfadeTo(targetIdx);
}

function crossfadeTo(nextIdx) {
  unlockAudioIfNeeded();

  standby.volume = 0;
  loadInto(standby, nextIdx);

  standby.oncanplay = async () => {
    standby.oncanplay = null;
    try {
      await standby.play(); // should be allowed after unlock
    } catch (e) {
      console.warn("Standby play blocked, doing hard switch:", e);
      hardSwitch(nextIdx);
      return;
    }

    const start = performance.now();
    const startVolActive = isNaN(active.volume) ? 1 : active.volume;

    function step(now) {
      const k = Math.min(1, (now - start) / crossfadeMs);
      standby.volume = k;
      active.volume = (1 - k) * startVolActive;

      if (k < 1) {
        requestAnimationFrame(step);
      } else {
        active.pause();
        active.volume = 1;
        const temp = active; active = standby; standby = temp;

        index = nextIdx;
        syncMeta(index);
        durT.textContent = fmt(active.duration);
        buildMarkers();

        if (isPlaying) {
          document.body.classList.add("playing");
          playPauseBtn.textContent = "❚❚";
          tick();
        } else {
          document.body.classList.remove("playing");
          playPauseBtn.textContent = "►";
        }
      }
    }
    requestAnimationFrame(step);
  };
}

function hardSwitch(nextIdx) {
  active.pause();
  loadInto(active, nextIdx);
  index = nextIdx;
  syncMeta(index);
  if (isPlaying) {
    active.play().catch(err => console.warn("Hard switch play blocked:", err));
  }
}

function maybeAutoNext() {
  if (!active.duration || !isFinite(active.duration)) return;
  const remaining = active.duration - active.currentTime;
  const lead = Math.min(crossfadeMs / 1000, 2.0);
  if (remaining <= lead) {
    active.removeEventListener("timeupdate", maybeAutoNext);
    goTo("next");
  }
}

seek.addEventListener("input", () => {
  seeking = true;
  const pct = seek.value / 1000;
  seek.style.setProperty("--fill", `${pct * 100}%`);
});
seek.addEventListener("change", () => {
  const pct = seek.value / 1000;
  if (active.duration) active.currentTime = pct * active.duration;
  seeking = false;
});

function tick() {
  if (!seeking) {
    setFillFromAudio(active);
    curT.textContent = fmt(active.currentTime);
    durT.textContent = fmt(active.duration);
  }
  active.removeEventListener("timeupdate", maybeAutoNext);
  active.addEventListener("timeupdate", maybeAutoNext);

  if (!active.paused && !active.ended) {
    rafId = requestAnimationFrame(tick);
  }
}

["play", "pause", "ended"].forEach(evt => {
  active.addEventListener(evt, () => {
    if (evt === "play") {
      isPlaying = true;
      document.body.classList.add("playing");
      playPauseBtn.textContent = "❚❚";
      tick();
    } else if (evt === "pause") {
      isPlaying = false;
      document.body.classList.remove("playing");
      playPauseBtn.textContent = "►";
      cancelAnimationFrame(rafId);
    } else if (evt === "ended") {
      goTo("next");
    }
  });
});

window.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  if (e.code === "ArrowRight") { goTo("next"); }
  if (e.code === "ArrowLeft")  { goTo("prev"); }
});
