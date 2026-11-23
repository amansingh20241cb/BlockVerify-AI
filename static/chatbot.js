/* BlockVerify - voice-activated assistant widget.
   Say the bot's name (default "Nova") to wake it, then ask your question.
   Works in Chrome / Edge (Web Speech API). Text chat works in every browser. */
(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const AWAKE_MS = 20000; // stay awake for follow-up questions
  let cfg = { name: "Nova", aliases: ["nova"], ai_enabled: false };
  let lastAnalysis = null, history = [];
  let rec = null, micOn = false, awake = false, awakeTimer = null, speaking = false, voiceOut = true;
  let el = {};

  // Capture the latest document report so the bot can explain it.
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0].url;
      if (url && url.includes("/api/analyze") && res.ok) res.clone().json().then(j => { lastAnalysis = j; }).catch(() => {});
    } catch (e) {}
    return res;
  };

  function esc(s) { return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function fmt(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>").replace(/\n/g, "<br>"); }

  function build() {
    const root = document.createElement("div");
    root.id = "nv-chat";
    root.innerHTML = `
      <button id="nv-fab" aria-label="Open assistant">💬<span id="nv-dot"></span></button>
      <section id="nv-panel" hidden>
        <header>
          <div><strong id="nv-title"></strong><small id="nv-status">Sleeping</small></div>
          <div class="nv-actions">
            <button id="nv-mic" title="Turn voice wake-word on/off">🎙️</button>
            <button id="nv-speak" title="Read answers aloud">🔊</button>
            <button id="nv-close" title="Close">✕</button>
          </div>
        </header>
        <div id="nv-msgs" aria-live="polite"></div>
        <div id="nv-hint"></div>
        <form id="nv-form"><input id="nv-input" autocomplete="off" maxlength="500" /><button type="submit">Send</button></form>
      </section>`;
    document.body.appendChild(root);
    ["fab", "panel", "title", "status", "mic", "speak", "close", "msgs", "hint", "form", "input", "dot"].forEach(k => el[k] = document.getElementById("nv-" + k));
    el.title.textContent = cfg.name + " · Assistant";
    el.input.placeholder = "Ask " + cfg.name + " anything…";
    el.hint.textContent = SR ? `Click 🎙️, then say “${cfg.name}” followed by your question.` : "Voice needs Chrome or Edge. You can still type.";
    el.fab.onclick = () => togglePanel(true);
    el.close.onclick = () => togglePanel(false);
    el.mic.onclick = () => (micOn ? stopMic() : startMic());
    el.speak.onclick = () => { voiceOut = !voiceOut; el.speak.classList.toggle("off", !voiceOut); if (!voiceOut) speechSynthesis.cancel(); };
    el.form.onsubmit = e => { e.preventDefault(); const q = el.input.value.trim(); if (q) { el.input.value = ""; ask(q); } };
    addMsg("bot", `Hi, I'm ${cfg.name}! Ask me about document hashing, blockchain, MetaMask, or your report${cfg.ai_enabled ? ", or anything else" : ""}.`);
  }

  function togglePanel(open) { el.panel.hidden = !open; el.fab.classList.toggle("hide", open); if (open) el.input.focus(); }
  function setStatus(t) { el.status.textContent = t; el.panel.classList.toggle("awake", awake); el.dot.className = micOn ? (awake ? "awake" : "on") : ""; }
  function addMsg(who, text) {
    const d = document.createElement("div");
    d.className = "nv-msg " + who;
    d.innerHTML = fmt(text);
    el.msgs.appendChild(d);
    el.msgs.scrollTop = el.msgs.scrollHeight;
    return d;
  }

  // ---------------------------------------------------------------- voice
  function startMic() {
    if (!SR) { addMsg("bot", "Your browser doesn't support voice recognition. Please use Chrome or Edge, or type your question."); return; }
    rec = new SR();
    rec.lang = "en-IN"; rec.continuous = true; rec.interimResults = false;
    rec.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onSpeech(e.results[i][0].transcript.trim()); };
    rec.onend = () => { if (micOn && !speaking) { try { rec.start(); } catch (e) {} } };
    rec.onerror = e => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { micOn = false; el.mic.classList.remove("on"); setStatus("Mic blocked"); addMsg("bot", "Microphone permission was blocked. Allow the mic in your browser's address bar and try again."); }
    };
    micOn = true; el.mic.classList.add("on");
    try { rec.start(); } catch (e) {}
    setStatus(`Listening for “${cfg.name}”…`);
  }
  function stopMic() { micOn = false; awake = false; el.mic.classList.remove("on"); if (rec) try { rec.stop(); } catch (e) {} setStatus("Sleeping"); }

  function wakeRegex() {
    const names = [cfg.name.toLowerCase(), ...cfg.aliases].filter((v, i, a) => v && a.indexOf(v) === i).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp("\\b(?:(?:hey|hi|hello|ok|okay)\\s+)?(?:" + names.join("|") + ")\\b", "i");
  }
  function sleep() { awake = false; clearTimeout(awakeTimer); setStatus(micOn ? `Listening for “${cfg.name}”…` : "Sleeping"); }
  function keepAwake() { awake = true; clearTimeout(awakeTimer); awakeTimer = setTimeout(sleep, AWAKE_MS); setStatus("Awake – ask your question"); }

  function onSpeech(text) {
    const m = text.match(wakeRegex());
    if (m) {
      togglePanel(true); keepAwake();
      const rest = text.slice(m.index + m[0].length).replace(/^[\s,.!?:-]+/, "");
      if (rest.length > 2) ask(rest, true);
      else { const hi = "Yes, I'm listening."; addMsg("bot", hi); speak(hi); }
      return;
    }
    if (!awake) return;
    if (/^(stop|bye|goodbye|go to sleep|sleep|thank you|thanks)\b/i.test(text)) { speechSynthesis.cancel(); addMsg("bot", "Okay, going to sleep. Say my name to wake me."); sleep(); return; }
    ask(text, true);
  }

  function speak(text) {
    if (!voiceOut || !window.speechSynthesis) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*`#_]/g, ""));
    u.lang = "en-IN"; u.rate = 1;
    const done = () => { speaking = false; if (micOn && rec) { try { rec.start(); } catch (e) {} } };
    u.onstart = () => { speaking = true; if (rec) try { rec.stop(); } catch (e) {} }; // don't hear ourselves
    u.onend = done; u.onerror = done;
    speechSynthesis.speak(u);
  }

  // ---------------------------------------------------------------- chat

  async function ask(q, fromVoice) {
    addMsg("user", q);

    const typing = addMsg("bot typing", "Thinking…");

    if (awake) keepAwake();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: q,
          history: history.slice(-8),
          context: lastAnalysis
        })
      });

      const data = await response.json();

      typing.remove();

      if (!response.ok) {
        throw new Error(data.error || "Server error: " + response.status);
      }

      const reply = data.reply || "Sorry, I received an empty response.";

      addMsg("bot", reply);

      history.push(
        { role: "user", content: q },
        { role: "assistant", content: reply }
      );

      if (data.mode === "gemini") {
        setStatus("Gemini connected");
      } else if (data.mode === "offline") {
        setStatus("Offline mode");
      }

      if (fromVoice || voiceOut) {
        speak(reply);
      }

    } catch (error) {
      typing.remove();
      console.error("Nova Chat Error:", error);
      addMsg("bot", "Unable to get a response: " + error.message);
    }
  }

  // Load chatbot configuration
  fetch("/api/chat/config")
    .then(response => response.json())
    .then(config => {
      cfg = config;
    })
    .catch(error => {
      console.error("Chat configuration error:", error);
    })
    .finally(() => {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", build);
      } else {
        build();
      }
    });

})();
