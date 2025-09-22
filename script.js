/* Sleek Music Player with Crossfade + Seek
   Files it expects:
   - images/image1.jpg, image2.jpg, image3.jpg
   - music/song1.mp3, song2.mp3, song3.mp3
   Safari-friendly: no autoplay; play starts on user gesture.
*/

const tracks = [
  { title: "Song 1", src: "music/song1.mp3", cover: "images/image1.jpg" },
  { title: "Song 2", src: "music/song2.mp3", cover: "images/image2.jpg" },
  { title: "Song 3", src: "music/song3.mp3", cover: "images/image3.jpg" }
];

const crossfadeMs = 1500; // smooth transition length
let index = 0;

// Elements
const audioA = document.getElementById("audioA");
const audioB = document.getElementById("audioB");
const playPauseBtn = document.getElementById("playPauseBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const seek = document.getElementById("seek");
const curT = document.getElementById("currentTime");
const durT = document.getElementById("duration");
const art = document.getElementById("albumArt");
const titleEl = document.getElementById("trackTitle");
const indexEl = document.getElementById("trackIndex");

let active = audioA;   // currently heard
let standby = audioB;  // used for next track preload
let isPlaying = false;
let rafId = null;
let seeking = false;

// Helpers
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
  seek.value = Math.round(pct * 10); // since max=1000
}

// Load current index into a given audio element
function loadInto(audio, i) {
  const t = tracks[i];
  audio.src = t.src;
  audio.load();
}

// UI sync for meta + art
function syncMeta(i) {
  const t = tracks[i];
  art.src = t.cover;
  titleEl.textContent = t.title;
  indexEl.textContent = `${i + 1} / ${tracks.length}`;
}

// Initial setup
loadInto(active, index);
syncMeta(index);

// Update duration when metadata is ready
function onLoadedMeta(e) {
  if (e.target !== active) return;
  durT.textContent = fmt(active.duration);
}
active.addEventListener("loadedmetadata", onLoadedMeta);

// Play/Pause
async function togglePlay() {
  if (!isPlaying) {
    await active.play();
    isPlaying = true;
    document.body.classList.add("playing");
    playPauseBtn.textContent = "❚❚";
    tick();
  } else {
    active.pause();
    isPlaying = false;
    document.body.classList.remove("playing");
    playPauseBtn.textContent = "►";
    cancelAnimationFrame(rafId);
  }
}

playPauseBtn.addEventListener("click", togglePlay);

// Previous / Next
prevBtn.addEventListener("click", () => goTo("prev"));
nextBtn.addEventListener("click", () => goTo("next"));

function goTo(direction) {
  const nextIndex =
    direction === "next"
      ? (index + 1) % tracks.length
      : (index - 1 + tracks.length) % tracks.length;

  crossfadeTo(nextIndex);
}

function crossfadeTo(nextIdx) {
  // Prepare standby
  standby.volume = 0;
  loadInto(standby, nextIdx);

  // When standby can play, start crossfade
  standby.oncanplay = async () => {
    standby.oncanplay = null;
    try {
      await standby.play(); // user already interacted -> allowed
    } catch {
      // If Safari blocks for any reason, fallback to hard switch
      hardSwitch(nextIdx);
      return;
    }

    const start = performance.now();
    const startVolActive = isNaN(active.volume) ? 1 : active.volume;

    function step(now) {
      const elapsed = now - start;
      const k = Math.min(1, elapsed / crossfadeMs);
      standby.volume = k;
      active.volume = (1 - k) * startVolActive;

      if (k < 1) {
        requestAnimationFrame(step);
      } else {
        // Finish
        active.pause();
        active.volume = 1;
        // swap roles
        const temp = active;
        active = standby;
        standby = temp;

        // Update index + UI
        index = nextIdx;
        syncMeta(index);
        durT.textContent = fmt(active.duration);

        // Keep playing state/UI coherent
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

// In case crossfade can't start (e.g., blocked play)
function hardSwitch(nextIdx) {
  active.pause();
  loadInto(active, nextIdx);
  index = nextIdx;
  syncMeta(index);
  if (isPlaying) active.play();
}

// Auto-next at end (with crossfade)
function maybeAutoNext() {
  if (!active.duration || !isFinite(active.duration)) return;
  // Start crossfade a bit before the end for seamlessness
  const remaining = active.duration - active.currentTime;
  const lead = Math.min(crossfadeMs / 1000, 2.0); // small lead window
  if (remaining <= lead) {
    // Prevent multiple triggers
    active.removeEventListener("timeupdate", maybeAutoNext);
    goTo("next");
  }
}

// Progress + seek
seek.addEventListener("input", () => {
  seeking = true;
  const pct = seek.value / 1000;
  seek.style.setProperty("--fill", `${pct * 100}%`);
});

seek.addEventListener("change", () => {
  const pct = seek.value / 1000;
  if (active.duration) {
    active.currentTime = pct * active.duration;
  }
  seeking = false;
});

// Keep progress updated while playing
function tick() {
  if (!seeking) {
    setFillFromAudio(active);
    curT.textContent = fmt(active.currentTime);
    durT.textContent = fmt(active.duration);
  }
  // Re-attach auto-next watcher
  active.removeEventListener("timeupdate", maybeAutoNext);
  active.addEventListener("timeupdate", maybeAutoNext);

  if (!active.paused && !active.ended) {
    rafId = requestAnimationFrame(tick);
  }
}

// Update play/pause UI if user taps system controls
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
      // Safety: go next if ended without crossfade trigger
      goTo("next");
    }
  });
});

// Keyboard shortcuts (space, ←, →)
window.addEventListener("keydown", (e) => {
  if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  if (e.code === "ArrowRight") { goTo("next"); }
  if (e.code === "ArrowLeft") { goTo("prev"); }
});
