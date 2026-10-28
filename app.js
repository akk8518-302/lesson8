/**
 * ==============================================================================
 * 國小國語互動學習系統 - 核心應用程式引擎 (app.js)
 * 模組特性：與 LESSON_DATA 資料完全分離，支援觸控、平板、教室投影與單機離線執行
 * ==============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
  // 檢查資料庫是否已正確載入
  if (typeof LESSON_DATA === "undefined") {
    console.error("找不到 LESSON_DATA，請確認 lesson-data.js 是否已正確引入！");
    return;
  }

  // 全域狀態管理
  const state = {
    soundEnabled: true,
    fontSizeMode: "standard", // standard 或 projector
    currentUnit: "unit-guide",
    
    // 第二單元配對遊戲狀態
    matchSelection: {
      term: null,
      def: null
    },
    matchedPairsCount: 0,

    // 第六單元闖關大冒險狀態
    adventure: {
      currentStageIndex: 0,
      totalScore: 0,
      userAnswers: {},
      wrongQuestions: [],
      stageScores: [0, 0, 0, 0, 0],
      isRetryMode: false
    }
  };

  /* ============================================================================
     1. Web Audio API 音效合成引擎（無需任何外部音檔，100% 離線支援）
     ============================================================================ */
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function playTone(freq, duration, type = "sine", gainVal = 0.15) {
    if (!state.soundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.warn("音效播放失敗", e);
    }
  }

  function playSound(type) {
    if (!state.soundEnabled) return;
    if (type === "correct") {
      // 答對音效：清脆大和弦琶音 (C5 -> E5 -> G5 -> C6)
      playTone(523.25, 0.1, "triangle", 0.15);
      setTimeout(() => playTone(659.25, 0.1, "triangle", 0.15), 80);
      setTimeout(() => playTone(783.99, 0.12, "triangle", 0.15), 160);
      setTimeout(() => playTone(1046.5, 0.25, "sine", 0.2), 240);
    } else if (type === "wrong") {
      // 答錯音效：柔和低音提醒
      playTone(330, 0.15, "sawtooth", 0.1);
      setTimeout(() => playTone(277, 0.25, "sawtooth", 0.1), 120);
    } else if (type === "click") {
      // 點擊音效
      playTone(600, 0.05, "sine", 0.08);
    } else if (type === "fanfare") {
      // 破關大慶祝音效
      const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
      notes.forEach((f, idx) => {
        setTimeout(() => playTone(f, 0.18, "triangle", 0.2), idx * 120);
      });
    }
  }

  /* ============================================================================
     2. 語音朗讀合成引擎 (Web Speech Synthesis API)
     ============================================================================ */
  function speakText(text) {
    if (!("speechSynthesis" in window)) {
      alert("您的瀏覽器暫時不支援語音朗讀功能，建議使用 Chrome 或 Edge 瀏覽器！");
      return;
    }
    window.speechSynthesis.cancel(); // 停止先前的朗讀

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-TW"; // 繁體中文
    utterance.rate = 0.95;    // 適合四年級學童的溫和語速
    utterance.pitch = 1.05;

    // 優先挑選繁體中文聲音
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang.includes("zh-TW") || v.lang.includes("zh_TW"));
    if (zhVoice) {
      utterance.voice = zhVoice;
    }

    window.speechSynthesis.speak(utterance);
  }

  /* ============================================================================
     3. 頂部工具列控制與字體大小切換（教室投影模式）
     ============================================================================ */
  const btnToggleSound = document.getElementById("btn-toggle-sound");
  const soundIcon = document.getElementById("sound-icon");
  const soundText = document.getElementById("sound-text");

  btnToggleSound.addEventListener("click", () => {
    state.soundEnabled = !state.soundEnabled;
    if (state.soundEnabled) {
      soundIcon.textContent = "🔊";
      soundText.textContent = "音效開啟";
      playSound("click");
    } else {
      soundIcon.textContent = "🔇";
      soundText.textContent = "音效靜音";
    }
  });

  const btnFontSize = document.getElementById("btn-font-size");
  const fontSizeText = document.getElementById("font-size-text");

  btnFontSize.addEventListener("click", () => {
    if (state.fontSizeMode === "standard") {
      state.fontSizeMode = "projector";
      document.body.style.fontSize = "23px";
      fontSizeText.textContent = "標準字體";
    } else {
      state.fontSizeMode = "standard";
      document.body.style.fontSize = "19px";
      fontSizeText.textContent = "教室投影大字";
    }
    playSound("click");
  });

  // 單元標籤切換
  const navTabs = document.querySelectorAll(".nav-tab");
  const unitSections = document.querySelectorAll(".unit-section");

  navTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const targetUnitId = tab.getAttribute("data-unit");
      switchUnit(targetUnitId);
      playSound("click");
    });
  });

  function switchUnit(unitId) {
    state.currentUnit = unitId;
    navTabs.forEach(t => {
      if (t.getAttribute("data-unit") === unitId) {
        t.classList.add("active");
      } else {
        t.classList.remove("active");
      }
    });

    unitSections.forEach(sec => {
      if (sec.id === unitId) {
        sec.classList.add("active");
      } else {
        sec.classList.remove("active");
      }
    });

    // 捲動至頂部
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ============================================================================
     4. 第一單元：課文導讀渲染與分段空間移動
     ============================================================================ */
  function renderUnitGuide() {
    // 渲染課文大意
    const guideSummary = document.getElementById("guide-summary-text");
    guideSummary.textContent = LESSON_DATA.meta.summary;

    // 課前思考問題
    const preContainer = document.getElementById("pre-questions-container");
    preContainer.innerHTML = "";
    LESSON_DATA.preQuestions.forEach((q, index) => {
      const qDiv = document.createElement("div");
      qDiv.className = "pre-question-item";
      qDiv.innerHTML = `
        <div class="pre-q-header">
          <span>問題 ${index + 1}</span>：${q.question}
        </div>
        <div class="pre-q-body">
          <p style="color: #666; font-size: 0.95rem;">💡 思考引導：${q.hint}</p>
        </div>
        <button class="toggle-tip-btn" data-target="pre-box-${index}">
          <span>💬 查看教學引導與解析</span>
        </button>
        <div class="inspiration-box" id="pre-box-${index}">
          <strong>【老師與同學的思考點】</strong><br>
          ${q.inspiration}
        </div>
      `;
      preContainer.appendChild(qDiv);
    });

    // 綁定課前問題引導按鈕事件
    preContainer.querySelectorAll(".toggle-tip-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const boxId = btn.getAttribute("data-target");
        const box = document.getElementById(boxId);
        box.classList.toggle("show");
        playSound("click");
      });
    });

    // 全文朗讀按鈕
    const btnReadFull = document.getElementById("btn-read-full-lesson");
    btnReadFull.addEventListener("click", () => {
      const fullText = LESSON_DATA.paragraphs.map(p => p.text).join(" ");
      speakText(fullText);
      playSound("click");
    });

    // 課文分段解析
    const paragraphsContainer = document.getElementById("paragraphs-container");
    paragraphsContainer.innerHTML = "";
    LESSON_DATA.paragraphs.forEach(p => {
      const pCard = document.createElement("div");
      pCard.className = "paragraph-card";
      pCard.innerHTML = `
        <div class="para-header">
          <div class="para-title-group">
            <span class="para-badge">第 ${p.index} 段</span>
            <span class="para-title">${p.title}</span>
          </div>
          <div class="para-tags">
            <span class="spatial-pill">📍 ${p.spatialTag}</span>
            <span class="sensory-pill">👁️ ${p.sensoryTag}</span>
          </div>
        </div>
        <div class="para-text">${p.text}</div>
        <div class="para-footer">
          <div class="para-notes">
            <strong>【段落要點】</strong>${p.mainIdea}<br>
            <span style="font-size: 0.9rem; color: #718096;">🔍 ${p.keyNotes}</span>
          </div>
          <button class="btn-tts para-tts-btn" data-text="${p.text}">
            <span>🔊 朗讀此段</span>
          </button>
        </div>
      `;
      paragraphsContainer.appendChild(pCard);
    });

    // 綁定個別段落朗讀
    paragraphsContainer.querySelectorAll(".para-tts-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const text = btn.getAttribute("data-text");
        speakText(text);
        playSound("click");
      });
    });
  }

  /* ============================================================================
     5. 第二單元：生字、語詞、多音字講堂與配對遊戲
     ============================================================================ */
  function renderUnitVocab() {
    // 多音字卡片
    const polyContainer = document.getElementById("polyphone-container");
    polyContainer.innerHTML = "";
    LESSON_DATA.polyphones.forEach(poly => {
      const card = document.createElement("div");
      card.className = "polyphone-card";
      card.innerHTML = `
        <h3 style="font-size: 1.4rem; font-weight: 800; color: #1e3a8a; display: flex; align-items: center; gap: 0.5rem;">
          <span>🎯</span> 本課必考多音字講堂：「${poly.char}」字音義大解密
        </h3>
        <div class="poly-case-grid">
          ${poly.cases.map(c => `
            <div class="poly-case">
              <div class="poly-sound">${poly.char}（${c.sound}）</div>
              <p><strong>字義：</strong>${c.meaning}</p>
              <div style="margin-top: 0.5rem;">
                <strong>常見詞語：</strong>
                ${c.examples.map(ex => `<span class="badge" style="background:#e0e7ff; color:#3730a3; margin: 2px;">${ex}</span>`).join(" ")}
              </div>
            </div>
          `).join("")}
        </div>
        <div class="poly-tip-box">${poly.ruleTip}</div>
      `;
      polyContainer.appendChild(card);
    });

    // 15個生字學習卡片
    const charsContainer = document.getElementById("characters-container");
    charsContainer.innerHTML = "";
    LESSON_DATA.characters.forEach(c => {
      const cCard = document.createElement("div");
      cCard.className = "char-card";
      cCard.innerHTML = `
        <div class="char-head">
          <div class="char-symbol" title="點擊聆聽生字發音">${c.char}</div>
          <div class="char-meta-tags">
            <div class="char-bopomofo">${c.bopomofo}</div>
            <div class="char-radical">部首：${c.radical} 部</div>
            <div class="char-strokes">${c.strokes} 畫 / 總 ${c.totalStrokes} 畫</div>
          </div>
        </div>
        <div style="font-size: 0.95rem; margin-bottom: 0.4rem;">
          <strong>字義：</strong>${c.meaning}
        </div>
        <div class="char-words-list">
          ${c.words.map(w => `<span class="char-word-tag">${w}</span>`).join("")}
        </div>
        <div class="char-tip">💡 書寫叮嚀：${c.tip}</div>
      `;
      // 點擊卡片發音
      cCard.addEventListener("click", () => {
        speakText(`${c.char}，注音：${c.bopomofo}，部首：${c.radical}部，造詞：${c.words.join("、")}`);
        playSound("click");
      });
      charsContainer.appendChild(cCard);
    });

    // 重要語詞卡片
    const wordsContainer = document.getElementById("words-container");
    wordsContainer.innerHTML = "";
    LESSON_DATA.words.forEach(w => {
      const wCard = document.createElement("div");
      wCard.className = "vocab-card";
      wCard.innerHTML = `
        <div class="vocab-title">
          <span>${w.word}</span>
          <span class="vocab-bopo">${w.bopomofo}</span>
        </div>
        <span class="badge" style="background: #eef2f6; color: #475569;">${w.category}</span>
        <div class="vocab-meaning">${w.meaning}</div>
        <div class="vocab-example">
          <strong>課文情境例句：</strong>${w.example}
        </div>
        <div style="text-align: right; margin-top: 0.6rem;">
          <button class="btn-tts btn-word-speak" style="padding: 0.3rem 0.8rem; font-size: 0.85rem;" data-text="${w.word}。${w.meaning}">
            <span>🔊 聽詞語解釋</span>
          </button>
        </div>
      `;
      wordsContainer.appendChild(wCard);
    });

    wordsContainer.querySelectorAll(".btn-word-speak").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        speakText(btn.getAttribute("data-text"));
        playSound("click");
      });
    });

    // 語詞配對遊戲初始化
    initVocabMatchGame();

    // 語詞隨堂測驗
    renderQuizContainer("vocab-quizzes-container", LESSON_DATA.vocabQuizzes);
  }

  // 語詞配對遊戲邏輯
  function initVocabMatchGame() {
    const colTerms = document.getElementById("match-col-terms");
    const colDefs = document.getElementById("match-col-defs");
    colTerms.innerHTML = "";
    colDefs.innerHTML = "";
    state.matchSelection = { term: null, def: null };
    state.matchedPairsCount = 0;

    const pairs = [...LESSON_DATA.vocabPairs];
    const shuffledTerms = [...pairs].sort(() => Math.random() - 0.5);
    const shuffledDefs = [...pairs].sort(() => Math.random() - 0.5);

    shuffledTerms.forEach(p => {
      const card = document.createElement("div");
      card.className = "match-card";
      card.textContent = p.term;
      card.setAttribute("data-term", p.term);
      card.addEventListener("click", () => handleTermClick(card, p.term));
      colTerms.appendChild(card);
    });

    shuffledDefs.forEach(p => {
      const card = document.createElement("div");
      card.className = "match-card";
      card.textContent = p.match;
      card.setAttribute("data-term", p.term);
      card.addEventListener("click", () => handleDefClick(card, p.term));
      colDefs.appendChild(card);
    });

    document.getElementById("btn-reset-match").onclick = () => {
      initVocabMatchGame();
      playSound("click");
    };
  }

  function handleTermClick(card, term) {
    if (card.classList.contains("matched")) return;
    document.querySelectorAll("#match-col-terms .match-card").forEach(c => c.classList.remove("active-select"));
    card.classList.add("active-select");
    state.matchSelection.term = { card, term };
    playSound("click");
    checkMatch();
  }

  function handleDefClick(card, term) {
    if (card.classList.contains("matched")) return;
    document.querySelectorAll("#match-col-defs .match-card").forEach(c => c.classList.remove("active-select"));
    card.classList.add("active-select");
    state.matchSelection.def = { card, term };
    playSound("click");
    checkMatch();
  }

  function checkMatch() {
    if (state.matchSelection.term && state.matchSelection.def) {
      const isMatch = state.matchSelection.term.term === state.matchSelection.def.term;
      if (isMatch) {
        playSound("correct");
        state.matchSelection.term.card.classList.remove("active-select");
        state.matchSelection.def.card.classList.remove("active-select");
        state.matchSelection.term.card.classList.add("matched");
        state.matchSelection.def.card.classList.add("matched");
        state.matchSelection.term.card.innerHTML += " ✅";
        state.matchSelection.def.card.innerHTML += " ✅";
        state.matchedPairsCount++;
        state.matchSelection.term = null;
        state.matchSelection.def = null;

        if (state.matchedPairsCount === LESSON_DATA.vocabPairs.length) {
          setTimeout(() => {
            alert("🎉 太厲害了！你完成了所有語詞與解釋的配對！");
          }, 300);
        }
      } else {
        playSound("wrong");
        const termCard = state.matchSelection.term.card;
        const defCard = state.matchSelection.def.card;
        setTimeout(() => {
          termCard.classList.remove("active-select");
          defCard.classList.remove("active-select");
          state.matchSelection.term = null;
          state.matchSelection.def = null;
        }, 500);
      }
    }
  }

  /* ============================================================================
     6. 第三單元：句型、修辭與句子重組
     ============================================================================ */
  function renderUnitGrammar() {
    // 渲染句型結構卡片
    const grammarContainer = document.getElementById("sentence-knowledge-container");
    grammarContainer.innerHTML = "";
    LESSON_DATA.sentenceKnowledge.forEach(k => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem;">
          <h3 style="font-size: 1.35rem; font-weight: 800; color: #1e3a8a;">${k.type}</h3>
          <span class="badge" style="background:#dbeafe; color:#1d4ed8;">課文重點修辭</span>
        </div>
        <div style="background: #fdfaf4; padding: 1rem; border-radius: var(--radius-md); border-left: 4px solid var(--warning); margin-bottom: 0.8rem;">
          <strong style="color: #92400e;">課文原句：</strong>
          <span style="font-size: 1.15rem; font-weight: 700;">「${k.lessonSentence}」</span>
        </div>
        <p style="margin-bottom: 0.5rem;"><strong>語法架構：</strong><code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${k.structure}</code></p>
        <p style="color: #4b5563; margin-bottom: 0.6rem;"><strong>寫作精析：</strong>${k.explanation}</p>
        <div style="background: #f8fafc; padding: 0.6rem 0.8rem; border-radius: var(--radius-sm); font-size: 0.95rem; color: #047857;">
          <strong>🌱 生活仿寫例句：</strong>${k.example}
        </div>
      `;
      grammarContainer.appendChild(card);
    });

    // 句子重組互動遊戲
    initSentenceUnscramble();

    // 句型隨堂測驗
    renderQuizContainer("sentence-quizzes-container", LESSON_DATA.sentenceExercises || LESSON_DATA.sentenceQuizzes);
  }

  function initSentenceUnscramble() {
    const unscrambleHost = document.getElementById("unscramble-container");
    unscrambleHost.innerHTML = "";

    LESSON_DATA.sentenceUnscrambles.forEach((task, tIndex) => {
      const taskWrapper = document.createElement("div");
      taskWrapper.className = "unscramble-container";
      taskWrapper.innerHTML = `
        <h4 style="font-size: 1.25rem; font-weight: 800; color: #b45309; margin-bottom: 0.5rem;">
          任務 ${tIndex + 1}：依據課文句意，點選詞塊拼出完整句子
        </h4>
        <p style="font-size: 0.95rem; color: #6b7280; margin-bottom: 0.8rem;">💡 排序提示：${task.tip}</p>
        
        <div style="font-weight: 700; margin-bottom: 0.4rem; color: #4b5563;">【詞塊庫】（點擊詞塊加入句子）：</div>
        <div class="chunks-source" id="source-${task.id}"></div>
        
        <div style="font-weight: 700; margin-bottom: 0.4rem; color: #166534;">【你重組的句子】：</div>
        <div class="sentence-target-area" id="target-${task.id}"></div>

        <div class="chunk-actions">
          <button class="btn-primary" id="btn-check-${task.id}"><span>✅ 檢查重組結果</span></button>
          <button class="btn-outline" id="btn-reset-${task.id}"><span>🔄 重置</span></button>
        </div>
        <div class="quiz-feedback" id="feedback-${task.id}"></div>
      `;
      unscrambleHost.appendChild(taskWrapper);

      const sourceDiv = taskWrapper.querySelector(`#source-${task.id}`);
      const targetDiv = taskWrapper.querySelector(`#target-${task.id}`);
      const feedbackDiv = taskWrapper.querySelector(`#feedback-${task.id}`);

      // 洗牌詞塊
      const shuffledChunks = [...task.chunks].sort(() => Math.random() - 0.5);

      function renderChunks() {
        sourceDiv.innerHTML = "";
        targetDiv.innerHTML = "";
        feedbackDiv.style.display = "none";

        shuffledChunks.forEach((chunkText, idx) => {
          const chunkBtn = document.createElement("button");
          chunkBtn.className = "word-chunk";
          chunkBtn.textContent = chunkText;
          chunkBtn.setAttribute("data-chunk", chunkText);
          chunkBtn.addEventListener("click", () => {
            if (chunkBtn.parentElement === sourceDiv) {
              targetDiv.appendChild(chunkBtn);
            } else {
              sourceDiv.appendChild(chunkBtn);
            }
            playSound("click");
          });
          sourceDiv.appendChild(chunkBtn);
        });
      }

      renderChunks();

      taskWrapper.querySelector(`#btn-reset-${task.id}`).addEventListener("click", () => {
        renderChunks();
        playSound("click");
      });

      taskWrapper.querySelector(`#btn-check-${task.id}`).addEventListener("click", () => {
        const assembledText = Array.from(targetDiv.children).map(c => c.textContent).join("");
        if (assembledText === task.target) {
          playSound("correct");
          feedbackDiv.className = "quiz-feedback show-correct";
          feedbackDiv.innerHTML = `<strong>🎉 太棒了！完全正確！</strong><br>正確句子：「${task.target}」`;
        } else {
          playSound("wrong");
          feedbackDiv.className = "quiz-feedback show-wrong";
          feedbackDiv.innerHTML = `<strong>❌ 順序還不太對喔，再試試看！</strong><br>再仔細讀讀看句子是否通順，或參考上方的提示。`;
        }
      });
    });
  }

  /* ============================================================================
     7. 第四單元：課文理解渲染 (5W1H)
     ============================================================================ */
  function renderUnitComprehension() {
    renderQuizContainer("reading-comprehension-container", LESSON_DATA.readingComprehensions);
  }

  /* ============================================================================
     8. 第五單元：思考與深究 (PIRLS 四層次)
     ============================================================================ */
  function renderUnitDeepThink() {
    const container = document.getElementById("deep-questions-container");
    container.innerHTML = "";

    LESSON_DATA.deepQuestions.forEach((q, index) => {
      const card = document.createElement("div");
      card.className = "deep-think-card";
      
      let sampleAnswersHtml = "";
      if (q.sampleAnswers) {
        sampleAnswersHtml = `
          <div style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.8rem;">
            ${q.sampleAnswers.map(ans => `
              <div style="background: #fff; padding: 0.8rem 1rem; border-radius: var(--radius-sm); border-left: 4px solid var(--secondary);">
                <strong style="color: #065f46;">${ans.view}</strong>
                <p style="margin-top: 0.3rem; font-size: 0.98rem; color: #374151;">${ans.content}</p>
              </div>
            `).join("")}
          </div>
        `;
      }

      card.innerHTML = `
        <span class="level-tag">${q.level}</span>
        <h3 class="deep-q-title">【思考題 ${index + 1}】${q.question}</h3>
        <p style="color: #64748b; margin-bottom: 1rem; font-size: 1rem;">
          🧭 思考引導：${q.analysisGuide}
        </p>
        <button class="toggle-answer-btn" data-target="deep-ans-${index}">
          <span>💡 展開深度解析與參考解答</span>
        </button>
        <div class="deep-answer-box" id="deep-ans-${index}">
          <strong style="color: #1e40af;">【參考答案與解析】：</strong>
          <p style="white-space: pre-line; margin-top: 0.5rem; line-height: 1.8;">${q.standardAnswer || ""}</p>
          ${sampleAnswersHtml}
          <div style="margin-top: 1rem; background: #e0f2fe; padding: 0.8rem; border-radius: var(--radius-sm); color: #0369a1; font-weight: 700;">
            🌟 學習省思：${q.reflection}
          </div>
        </div>
      `;

      card.querySelector(".toggle-answer-btn").addEventListener("click", function() {
        const box = document.getElementById(`deep-ans-${index}`);
        box.classList.toggle("show");
        if (box.classList.contains("show")) {
          this.innerHTML = "<span>🔼 收合深度解析</span>";
        } else {
          this.innerHTML = "<span>💡 展開深度解析與參考解答</span>";
        }
        playSound("click");
      });

      container.appendChild(card);
    });
  }

  /* ============================================================================
     9. 第六單元：互動闖關大冒險（全方位闖關引擎）
     ============================================================================ */
  function initAdventure() {
    state.adventure = {
      currentStageIndex: 0,
      totalScore: 0,
      userAnswers: {},
      wrongQuestions: [],
      stageScores: [0, 0, 0, 0, 0],
      isRetryMode: false
    };
    renderAdventureUI();
  }

  function renderAdventureUI() {
    const adv = state.adventure;
    const stages = LESSON_DATA.adventureStages;
    const host = document.getElementById("adventure-stages-host");
    host.innerHTML = "";

    // 更新儀表板
    updateAdventureDashboard();

    stages.forEach((stage, sIdx) => {
      const stageDiv = document.createElement("div");
      stageDiv.className = `stage-container ${sIdx === adv.currentStageIndex ? "active-stage" : ""}`;
      stageDiv.id = `stage-view-${sIdx}`;

      let stageContentHtml = "";
      if (stage.type === "single_choice") {
        stageContentHtml = stage.questions.map((q, qIdx) => `
          <div class="quiz-box" style="margin-bottom: 1.5rem;" id="adv-q-box-${q.id}">
            <div class="quiz-header">
              <span class="quiz-badge">第 ${qIdx + 1} 題</span>
            </div>
            <div class="quiz-question">${q.question.replace(/\n/g, "<br>")}</div>
            <div class="options-list">
              ${q.options.map((opt, oIdx) => {
                const optLetter = opt.trim().charAt(0);
                return `
                  <button class="option-btn adv-opt-btn" data-qid="${q.id}" data-opt="${optLetter}" data-sidx="${sIdx}">
                    <span>${opt}</span>
                  </button>
                `;
              }).join("")}
            </div>
            <div class="quiz-feedback" id="adv-fb-${q.id}"></div>
          </div>
        `).join("");
      } else if (stage.type === "match_pairs") {
        stageContentHtml = `
          <div class="match-game-container">
            <p style="font-weight: 700; color: #166534; margin-bottom: 1rem;">
              請將左側的課文精選語詞，與右側相對應的解釋點擊完成配對：
            </p>
            <div class="match-grid">
              <div class="match-column" id="adv-match-terms-${stage.stageId}"></div>
              <div class="match-column" id="adv-match-defs-${stage.stageId}"></div>
            </div>
          </div>
        `;
      }

      stageDiv.innerHTML = `
        <div class="stage-card">
          <div class="stage-header">
            <h3 class="stage-title"><span>🚩</span> ${stage.title}</h3>
            <p style="color: #6b7280; margin-top: 0.3rem;">${stage.description}</p>
          </div>
          ${stageContentHtml}
          <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem;">
            <button class="btn-primary btn-next-stage" data-sidx="${sIdx}" id="btn-next-stage-${sIdx}">
              <span>${sIdx === stages.length - 1 ? "🏆 完成挑戰・查看成績" : "前進下一關 ➔"}</span>
            </button>
          </div>
        </div>
      `;
      host.appendChild(stageDiv);

      // 若為配對關卡，初始化配對邏輯
      if (stage.type === "match_pairs") {
        initStageMatchPairs(stage, sIdx);
      }
    });

    // 綁定選擇題點選事件
    host.querySelectorAll(".adv-opt-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const qid = btn.getAttribute("data-qid");
        const selectedOpt = btn.getAttribute("data-opt");
        const sidx = parseInt(btn.getAttribute("data-sidx"));
        handleAdvAnswer(qid, selectedOpt, sidx);
      });
    });

    // 綁定前進下一關按鈕
    host.querySelectorAll(".btn-next-stage").forEach(btn => {
      btn.addEventListener("click", () => {
        const sidx = parseInt(btn.getAttribute("data-sidx"));
        nextStage(sidx);
        playSound("click");
      });
    });

    // 重新闖關按鈕
    document.getElementById("btn-restart-adventure").onclick = () => {
      initAdventure();
      playSound("click");
    };
  }

  function updateAdventureDashboard() {
    const adv = state.adventure;
    const stages = LESSON_DATA.adventureStages;
    document.getElementById("adv-stage-display").textContent = `${adv.currentStageIndex + 1} / ${stages.length}`;
    document.getElementById("adv-score-display").textContent = adv.totalScore;
    const pct = Math.round((adv.currentStageIndex / stages.length) * 100);
    document.getElementById("adv-progress-display").textContent = `${pct}%`;
    document.getElementById("adv-progress-bar").style.width = `${pct}%`;
  }

  function handleAdvAnswer(qid, selectedOpt, sidx) {
    const stage = LESSON_DATA.adventureStages[sidx];
    const q = stage.questions.find(item => item.id === qid);
    if (!q) return;

    const optButtons = document.querySelectorAll(`[data-qid="${qid}"]`);
    optButtons.forEach(btn => btn.disabled = true);

    const feedback = document.getElementById(`adv-fb-${qid}`);
    const isCorrect = selectedOpt === q.answer;

    if (isCorrect) {
      playSound("correct");
      state.adventure.totalScore += 20;
      feedback.className = "quiz-feedback show-correct";
      feedback.innerHTML = `<strong>🎉 答對了！+20 分</strong><br>${q.explanation}`;
      optButtons.forEach(btn => {
        if (btn.getAttribute("data-opt") === q.answer) {
          btn.classList.add("selected-correct");
        }
      });
    } else {
      playSound("wrong");
      state.adventure.wrongQuestions.push(q);
      feedback.className = "quiz-feedback show-wrong";
      feedback.innerHTML = `<strong>❌ 答錯了！正確答案是 (${q.answer})</strong><br>💡 解析：${q.explanation}`;
      optButtons.forEach(btn => {
        if (btn.getAttribute("data-opt") === selectedOpt) {
          btn.classList.add("selected-wrong");
        }
        if (btn.getAttribute("data-opt") === q.answer) {
          btn.classList.add("selected-correct");
        }
      });
    }

    updateAdventureDashboard();
  }

  function initStageMatchPairs(stage, sidx) {
    const termsHost = document.getElementById(`adv-match-terms-${stage.stageId}`);
    const defsHost = document.getElementById(`adv-match-defs-${stage.stageId}`);
    let selectedTerm = null;
    let selectedDef = null;
    let matchedCount = 0;

    const shuffledTerms = [...stage.pairs].sort(() => Math.random() - 0.5);
    const shuffledDefs = [...stage.pairs].sort(() => Math.random() - 0.5);

    shuffledTerms.forEach(p => {
      const card = document.createElement("div");
      card.className = "match-card";
      card.textContent = p.term;
      card.setAttribute("data-pair-id", p.id);
      card.addEventListener("click", () => {
        if (card.classList.contains("matched")) return;
        termsHost.querySelectorAll(".match-card").forEach(c => c.classList.remove("active-select"));
        card.classList.add("active-select");
        selectedTerm = { card, id: p.id };
        playSound("click");
        verifyStageMatch();
      });
      termsHost.appendChild(card);
    });

    shuffledDefs.forEach(p => {
      const card = document.createElement("div");
      card.className = "match-card";
      card.textContent = p.match;
      card.setAttribute("data-pair-id", p.id);
      card.addEventListener("click", () => {
        if (card.classList.contains("matched")) return;
        defsHost.querySelectorAll(".match-card").forEach(c => c.classList.remove("active-select"));
        card.classList.add("active-select");
        selectedDef = { card, id: p.id };
        playSound("click");
        verifyStageMatch();
      });
      defsHost.appendChild(card);
    });

    function verifyStageMatch() {
      if (selectedTerm && selectedDef) {
        if (selectedTerm.id === selectedDef.id) {
          playSound("correct");
          selectedTerm.card.classList.remove("active-select");
          selectedDef.card.classList.remove("active-select");
          selectedTerm.card.classList.add("matched");
          selectedDef.card.classList.add("matched");
          selectedTerm.card.innerHTML += " ✅";
          selectedDef.card.innerHTML += " ✅";
          matchedCount++;
          state.adventure.totalScore += 5;
          updateAdventureDashboard();
          selectedTerm = null;
          selectedDef = null;

          if (matchedCount === stage.pairs.length) {
            playSound("correct");
          }
        } else {
          playSound("wrong");
          const tCard = selectedTerm.card;
          const dCard = selectedDef.card;
          setTimeout(() => {
            tCard.classList.remove("active-select");
            dCard.classList.remove("active-select");
            selectedTerm = null;
            selectedDef = null;
          }, 400);
        }
      }
    }
  }

  function nextStage(currentIdx) {
    const stages = LESSON_DATA.adventureStages;
    if (currentIdx < stages.length - 1) {
      document.getElementById(`stage-view-${currentIdx}`).classList.remove("active-stage");
      state.adventure.currentStageIndex = currentIdx + 1;
      document.getElementById(`stage-view-${currentIdx + 1}`).classList.add("active-stage");
      updateAdventureDashboard();
      window.scrollTo({ top: 200, behavior: "smooth" });
    } else {
      // 完成所有關卡
      showCompletionCertificate();
    }
  }

  function showCompletionCertificate() {
    playSound("fanfare");
    const adv = state.adventure;
    const modal = document.getElementById("cert-modal");
    document.getElementById("cert-final-score").textContent = adv.totalScore;
    
    // 計算星星
    const starEl = document.getElementById("cert-stars");
    const feedbackEl = document.getElementById("cert-feedback-text");
    const retryBtn = document.getElementById("btn-retry-wrong");

    if (adv.totalScore >= 90) {
      starEl.textContent = "⭐⭐⭐⭐⭐（五星榮譽大師）";
      feedbackEl.innerHTML = `太驚人了！你展現了無與倫比的感受力與想像力，不管是童詩時序結構、精采譬喻修辭、或是多音字辨析全都難不倒你！恭喜榮獲<strong>【四季小小詩人特優榮譽獎】</strong>！`;
      retryBtn.style.display = "none";
    } else if (adv.totalScore >= 70) {
      starEl.textContent = "⭐⭐⭐⭐（四星觀察高手）";
      feedbackEl.innerHTML = `表現非常優秀！你已經精準掌握了課文的核心內容與童詩的寫作特色。只要再稍微留意細節，就能成為頂尖詩意觀察大師囉！`;
      retryBtn.style.display = adv.wrongQuestions.length > 0 ? "inline-flex" : "none";
    } else {
      starEl.textContent = "⭐⭐⭐（潛力小新星）";
      feedbackEl.innerHTML = `恭喜完成所有挑戰！學習是一步一腳印的旅程，建議可以回到前幾個單元複習生字卡與分段課文，再試著挑戰一次喔！`;
      retryBtn.style.display = adv.wrongQuestions.length > 0 ? "inline-flex" : "none";
    }

    modal.classList.add("show");

    document.getElementById("btn-modal-restart").onclick = () => {
      modal.classList.remove("show");
      initAdventure();
    };

    document.getElementById("btn-close-modal").onclick = () => {
      modal.classList.remove("show");
    };

    retryBtn.onclick = () => {
      modal.classList.remove("show");
      retryWrongQuestions();
    };
  }

  function retryWrongQuestions() {
    const wrongList = [...state.adventure.wrongQuestions];
    if (wrongList.length === 0) {
      alert("太棒了，目前沒有任何錯題喔！");
      return;
    }
    const host = document.getElementById("adventure-stages-host");
    host.innerHTML = `
      <div class="stage-card">
        <div class="stage-header">
          <h3 class="stage-title"><span>🎯</span> 錯題強化重練特訓區</h3>
          <p style="color: #6b7280; margin-top: 0.3rem;">複習剛剛答錯的 ${wrongList.length} 道題目，再次挑戰直到完全理解！</p>
        </div>
        <div id="retry-quizzes-host"></div>
        <div style="margin-top: 1.5rem; text-align: center;">
          <button class="btn-primary" id="btn-finish-retry"><span>🏆 結束重練返回完整闖關</span></button>
        </div>
      </div>
    `;
    renderQuizContainer("retry-quizzes-host", wrongList);

    document.getElementById("btn-finish-retry").onclick = () => {
      initAdventure();
      playSound("click");
    };
  }

  /* ============================================================================
     10. 通用測驗容器渲染函式
     ============================================================================ */
  function renderQuizContainer(containerId, quizList) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";

    quizList.forEach((q, qIndex) => {
      const qBox = document.createElement("div");
      qBox.className = "quiz-box";
      qBox.innerHTML = `
        <div class="quiz-header">
          <span class="quiz-badge">第 ${qIndex + 1} 題</span>
        </div>
        <div class="quiz-question">${q.question.replace(/\n/g, "<br>")}</div>
        <div class="options-list">
          ${q.options.map((opt) => {
            const letter = opt.trim().charAt(0);
            return `
              <button class="option-btn" data-qid="${q.id}" data-opt="${letter}">
                <span>${opt}</span>
              </button>
            `;
          }).join("")}
        </div>
        <div class="quiz-feedback" id="fb-${q.id}"></div>
      `;

      const optBtns = qBox.querySelectorAll(".option-btn");
      optBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          optBtns.forEach(b => b.disabled = true);
          const chosen = btn.getAttribute("data-opt");
          const feedback = qBox.querySelector(`#fb-${q.id}`);
          const isCorrect = chosen === q.answer;

          if (isCorrect) {
            playSound("correct");
            btn.classList.add("selected-correct");
            feedback.className = "quiz-feedback show-correct";
            feedback.innerHTML = `<strong>🎉 答對了！太厲害了！</strong><br>${q.explanation}`;
          } else {
            playSound("wrong");
            btn.classList.add("selected-wrong");
            optBtns.forEach(b => {
              if (b.getAttribute("data-opt") === q.answer) {
                b.classList.add("selected-correct");
              }
            });
            feedback.className = "quiz-feedback show-wrong";
            feedback.innerHTML = `<strong>❌ 答錯了喔！正確答案是 (${q.answer})</strong><br>💡 解析：${q.explanation}`;
          }
        });
      });

      container.appendChild(qBox);
    });
  }

  /* ============================================================================
     11. 系統啟動與初始化所有單元
     ============================================================================ */
  function initApp() {
    // 渲染課文標題與徽章
    document.getElementById("badge-unit").textContent = LESSON_DATA.meta.unit;
    document.getElementById("badge-lesson").textContent = `${LESSON_DATA.meta.lessonNumber} ${LESSON_DATA.meta.title}`;
    document.getElementById("badge-author").textContent = `作者：${LESSON_DATA.meta.author}`;

    // 各單元內容動態渲染
    renderUnitGuide();
    renderUnitVocab();
    renderUnitGrammar();
    renderUnitComprehension();
    renderUnitDeepThink();
    initAdventure();
  }

  initApp();
});

