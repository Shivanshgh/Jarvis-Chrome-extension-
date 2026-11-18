(() => {
  const defaults = [
    { name: "Google", url: "https://www.google.com" },
    { name: "YouTube", url: "https://www.youtube.com" },
    { name: "Gmail", url: "https://mail.google.com" },
    { name: "GitHub", url: "https://github.com" }
  ];
  const $ = (id) => document.getElementById(id);
  let shortcuts = defaults;
  let recognition = null;
  let audioStream = null;
  let audioContext = null;
  let audioFrame = 0;
  let waveformAnalyser = null;
  let waveformSamples = null;

  function updateClock() {
    const now = new Date();
    $("clock").textContent = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
    $("date").textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(now);
    const hour = now.getHours();
    $("greeting").textContent = hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";
  }

  function normalizedUrl(value) {
    const input = value.trim();
    if (!input) return "";
    const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`;
    try {
      const url = new URL(candidate);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  }

  function renderShortcuts() {
    const list = $("shortcutList");
    list.replaceChildren();
    if (!shortcuts.length) {
      const empty = document.createElement("span");
      empty.className = "empty-shortcuts";
      empty.textContent = "Add a shortcut to get started.";
      list.append(empty);
      return;
    }
    shortcuts.forEach(({ name, url }) => {
      const link = document.createElement("a");
      link.className = "shortcut";
      link.href = url;
      link.title = name;
      const icon = document.createElement("span");
      icon.className = "shortcut-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = name.trim().slice(0, 1) || "•";
      const label = document.createElement("span");
      label.className = "shortcut-name";
      label.textContent = name;
      link.append(icon, label);
      list.append(link);
    });
  }

  async function loadShortcuts() {
    try {
      const saved = await chrome.storage.local.get("jarvisShortcuts");
      if (Array.isArray(saved.jarvisShortcuts)) shortcuts = saved.jarvisShortcuts;
    } catch { /* Keep usable defaults when storage is unavailable. */ }
    renderShortcuts();
  }

  function addEditorRow(name = "", url = "") {
    const row = document.createElement("div");
    row.className = "editor-row";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.maxLength = 24;
    nameInput.placeholder = "Name";
    nameInput.value = name;
    nameInput.setAttribute("aria-label", "Shortcut name");
    const urlInput = document.createElement("input");
    urlInput.type = "url";
    urlInput.placeholder = "https://example.com";
    urlInput.value = url;
    urlInput.setAttribute("aria-label", "Shortcut website address");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-shortcut";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Remove shortcut");
    remove.addEventListener("click", () => row.remove());
    row.append(nameInput, urlInput, remove);
    $("editorRows").append(row);
  }

  function openEditor() {
    const rows = $("editorRows");
    rows.replaceChildren();
    shortcuts.forEach((shortcut) => addEditorRow(shortcut.name, shortcut.url));
    if (!shortcuts.length) addEditorRow();
    $("shortcutDialog").showModal();
  }

  $("searchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const query = $("searchInput").value.trim();
    if (query) location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  });

  $("manageShortcuts").addEventListener("click", openEditor);
  $("addShortcut").addEventListener("click", () => addEditorRow());
  $("shortcutEditor").addEventListener("submit", async (event) => {
    if (event.submitter?.value !== "save") return;
    event.preventDefault();
    const rows = [...$("editorRows").querySelectorAll(".editor-row")];
    const updated = [];
    for (const row of rows) {
      const [nameField, urlField] = row.querySelectorAll("input");
      const name = nameField.value.trim();
      const url = normalizedUrl(urlField.value);
      if (!name && !url) continue;
      if (!name || !url) {
        $("status").textContent = "Enter a name and a valid website address for each shortcut.";
        return;
      }
      updated.push({ name, url });
    }
    shortcuts = updated;
    try { await chrome.storage.local.set({ jarvisShortcuts: shortcuts }); } catch { /* Keep this tab's edits in memory. */ }
    renderShortcuts();
    $("status").textContent = "SHORTCUTS SAVED";
    $("shortcutDialog").close();
    window.setTimeout(() => { $("status").textContent = ""; }, 2200);
  });

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    const mic = $("micButton");
    const search = $("searchForm");
    const canvas = $("voiceWaveform");
    mic.hidden = false;
    canvas.hidden = false;
    recognition = new SpeechRecognition();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    function drawWaveform(time = 0) {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const context = canvas.getContext("2d");
      const bars = 20;
      context.clearRect(0, 0, width, height);
      context.fillStyle = waveformAnalyser ? "#72d5ff" : "#6f9ab7";
      context.shadowColor = waveformAnalyser ? "rgba(74, 191, 255, .65)" : "rgba(74, 160, 210, .2)";
      context.shadowBlur = (waveformAnalyser ? 6 : 2) * ratio;
      const gap = 2 * ratio;
      const barWidth = Math.max(1, (width - gap * (bars - 1)) / bars);
      if (waveformAnalyser && waveformSamples) waveformAnalyser.getByteTimeDomainData(waveformSamples);
      let totalLevel = 0;
      for (let bar = 0; bar < bars; bar++) {
        let level;
        if (waveformAnalyser && waveformSamples) {
          const start = Math.floor(bar * waveformSamples.length / bars);
          const end = Math.max(start + 1, Math.floor((bar + 1) * waveformSamples.length / bars));
          let energy = 0;
          for (let index = start; index < end; index++) energy += Math.abs(waveformSamples[index] - 128) / 128;
          level = energy / (end - start);
        } else {
          const phase = time * .002 + bar * .58;
          level = .07 + .28 * Math.abs(Math.sin(phase)) * (.35 + .65 * Math.abs(Math.sin(phase * .43 + 1.2)));
        }
        totalLevel += level;
        const barHeight = Math.max(2 * ratio, level * height * 2.1);
        context.fillRect(bar * (barWidth + gap), (height - barHeight) / 2, barWidth, barHeight);
      }
      const meanLevel = totalLevel / bars;
      const orbLevel = waveformAnalyser ? Math.min(1, meanLevel * 4) : .09 + .08 * Math.sin(time * .002);
      const orb = $("sphereWrap");
      orb.style.setProperty("--orb-scale", (1 + orbLevel * .045).toFixed(3));
      orb.style.setProperty("--orb-glow", `${64 + orbLevel * 112}px`);
      audioFrame = requestAnimationFrame(drawWaveform);
    }
    audioFrame = requestAnimationFrame(drawWaveform);
    function stopWaveform() {
      if (audioStream) audioStream.getTracks().forEach((track) => track.stop());
      audioStream = null;
      if (audioContext) audioContext.close().catch(() => {});
      audioContext = null;
      waveformAnalyser = null;
      waveformSamples = null;
      search.classList.remove("listening");
    }
    async function startWaveform() {
      if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) return;
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        if (!search.classList.contains("listening")) {
          audioStream.getTracks().forEach((track) => track.stop());
          audioStream = null;
          return;
        }
        audioContext = new AudioContext();
        waveformAnalyser = audioContext.createAnalyser();
        waveformAnalyser.fftSize = 256;
        waveformAnalyser.smoothingTimeConstant = .72;
        audioContext.createMediaStreamSource(audioStream).connect(waveformAnalyser);
        waveformSamples = new Uint8Array(waveformAnalyser.fftSize);
      } catch { /* Transcription may still work if live level access is denied. */ }
    }
    recognition.onstart = () => { $("searchInput").value = ""; mic.classList.add("listening"); mic.setAttribute("aria-pressed", "true"); search.classList.add("listening"); $("status").textContent = "LISTENING…"; startWaveform(); };
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = event.resultIndex; index < event.results.length; index++) transcript += event.results[index][0].transcript;
      $("searchInput").value = transcript.trim();
    };
    recognition.onerror = (event) => {
      $("status").textContent = event.error === "not-allowed" ? "MICROPHONE ACCESS WAS DENIED" : "VOICE SEARCH COULD NOT START";
    };
    recognition.onend = () => {
      mic.classList.remove("listening");
      mic.setAttribute("aria-pressed", "false");
      stopWaveform();
      const query = $("searchInput").value.trim();
      if (query) $("searchForm").requestSubmit();
      else $("status").textContent = "";
    };
    mic.addEventListener("click", () => {
      try { recognition.start(); } catch { $("status").textContent = "VOICE SEARCH IS ALREADY STARTING"; }
    });
  }

  updateClock();
  window.setInterval(updateClock, 1000);
  loadShortcuts();
})();
