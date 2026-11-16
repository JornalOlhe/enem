/* Simulado ENEM – lógica da interface. */
(function () {
  const D = window.ENEM_DATA;
  const API = window.EnemAPI;
  const AI = window.EnemAI;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const view = $("#view");
  const exams = {};          // ano -> {questions}
  const downloading = {};    // ano -> progresso
  let timerHandle = null;

  /* ---------- utilidades ---------- */
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast("Não foi possível salvar o progresso no navegador."); } };
  const cfg = () => load("sim:config", {});
  const setCfg = (patch) => save("sim:config", Object.assign(cfg(), patch));
  let USER = null; // usuário logado (primeiro nome em minúsculas)
  const sessKey = (y, d) => `sim:u:${USER}:sessao:${y}:${d}`;
  const getSess = (y, d) => load(sessKey(y, d), null);
  const setSess = (y, d, s) => save(sessKey(y, d), s);
  let ui = { tab: "inicio", sub: {} };
  const saveUI = () => USER && save(`sim:u:${USER}:ui`, ui);

  function toast(msg, ms = 3200) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._h); toast._h = setTimeout(() => (t.hidden = true), ms);
  }
  function modal(html) { $("#modalBody").innerHTML = html; $("#modal").hidden = false; }
  function closeModal() { $("#modal").hidden = true; }
  $("#modalClose").onclick = closeModal;
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  /* Markdown simples (formato usado pela enem.dev) */
  function md(text) {
    if (!text) return "";
    let s = esc(text);
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, alt, url) => `<img data-src="${url}" alt="${alt || "Imagem da questão"}" loading="lazy">`);
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/__([^_]+)__/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>").replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, "$1<em>$2</em>");
    return s.split(/\n{2,}/).map((p) => {
      p = p.trim(); if (!p) return "";
      if (/^(\d+[.)]|[-*•]) /m.test(p) && p.split("\n").every((l) => /^(\d+[.)]|[-*•]) /.test(l.trim()))) {
        const ordered = /^\d/.test(p.trim());
        const items = p.split("\n").map((l) => `<li>${l.trim().replace(/^(\d+[.)]|[-*•]) /, "")}</li>`).join("");
        return ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
      }
      if (/^#{1,4} /.test(p)) return `<h4>${p.replace(/^#{1,4} /, "")}</h4>`;
      if (/^&gt;/.test(p)) return `<blockquote>${p.replace(/^&gt;\s?/gm, "").replace(/\n/g, "<br>")}</blockquote>`;
      return `<p>${p.replace(/\n/g, "<br>")}</p>`;
    }).join("");
  }
  async function hydrateImages(root) {
    for (const img of $$("img[data-src]", root)) {
      const url = img.dataset.src; img.removeAttribute("data-src");
      img.src = await API.resolveImage(url);
      img.onerror = () => { img.alt = "Imagem indisponível offline – conecte-se à internet e baixe a prova novamente."; img.classList.add("broken"); };
    }
  }

  /* ---------- dados da prova ---------- */
  async function ensureExam(year) {
    if (exams[year]) return exams[year];
    const e = await API.getExam(year).catch(() => null);
    if (e) exams[year] = e;
    return e;
  }
  /* A API às vezes classifica a área errada. A área real é definida pelo bloco de 45 questões
     do caderno (1–45, 46–90, 91–135, 136–180): usamos a área majoritária de cada bloco. */
  function areaMap(e) {
    if (e._areaMap) return e._areaMap;
    const map = {};
    for (let b = 0; b < 4; b++) {
      const c = {};
      e.questions.filter((q) => q.index > b * 45 && q.index <= (b + 1) * 45).forEach((q) => { if (q.discipline) c[q.discipline] = (c[q.discipline] || 0) + 1; });
      map[b] = Object.keys(c).sort((x, y) => c[y] - c[x])[0];
    }
    return (e._areaMap = map);
  }
  function areaOf(q, e) { return areaMap(e)[Math.floor((q.index - 1) / 45)] || q.discipline; }
  function questionsFor(year, day, lang) {
    const e = exams[year]; if (!e) return [];
    const areas = D.DAYS[day].areas;
    const list = e.questions.map((q) => Object.assign({}, q, { discipline: areaOf(q, e) }))
      .filter((q) => areas.includes(q.discipline))
      .filter((q) => !q.language || q.language === lang);
    // questões ausentes da base pública: entram com o gabarito oficial e o enunciado aberto na fonte
    const has = new Set(list.map((q) => q.index));
    (D.FALTANTES || []).filter((f) => f.ano === Number(year) && areas.includes(f.area) && (!f.lingua || f.lingua === lang) && !has.has(f.n))
      .forEach((f) => list.push({
        index: f.n, year: f.ano, discipline: f.area, language: f.lingua, title: `Questão ${f.n} - ENEM ${f.ano}`,
        context: null, files: [], alternativesIntroduction: null, correctAlternative: f.gab,
        alternatives: ["A", "B", "C", "D", "E"].map((l) => ({ letter: l, text: null, file: null, isCorrect: l === f.gab })),
        externa: { url: f.url, fonte: f.fonte }
      }));
    // se existe versão na língua escolhida, descarta a versão sem língua do mesmo número
    const withLang = new Set(list.filter((q) => q.language).map((q) => q.index));
    const seen = new Set();
    return list.filter((q) => !(withLang.has(q.index) && !q.language))
      .filter((q) => { if (seen.has(q.index)) return false; seen.add(q.index); return true; })
      .sort((a, b) => areas.indexOf(a.discipline) - areas.indexOf(b.discipline) || a.index - b.index);
  }
  const qKey = (q) => q.index + "|" + (q.language || "");
  function langsAvailable(year) {
    const e = exams[year]; if (!e) return [];
    return [...new Set(e.questions.map((q) => q.language).filter(Boolean))];
  }

  /* ---------- abas ---------- */
  function renderTabs() {
    const tabs = [{ id: "inicio", label: "Início" }, ...D.YEARS.map((y) => ({ id: String(y), label: "ENEM " + y, year: y })), { id: "desempenho", label: "Desempenho" }];
    $("#tabs").innerHTML = tabs.map((t) => {
      const dot = t.year ? `<span class="dot ${exams[t.year] ? "ready" : ""}"></span>` : "";
      return `<button class="tab ${ui.tab === t.id ? "active" : ""}" role="tab" data-tab="${t.id}">${t.label}${dot}</button>`;
    }).join("");
    $$(".tab").forEach((b) => (b.onclick = () => go(b.dataset.tab)));
  }
  function go(tab) {
    ui.tab = tab; saveUI(); stopTimer(); render();
    window.scrollTo({ top: 0 });
  }
  async function render() {
    renderTabs();
    if (ui.tab === "inicio") return renderHome();
    if (ui.tab === "desempenho") return renderPerformance();
    const y = Number(ui.tab);
    await ensureExam(y); renderTabs();
    return renderYear(y);
  }

  /* ---------- Início ---------- */
  async function renderHome() {
    await Promise.all(D.YEARS.map(ensureExam)); renderTabs();
    const c = cfg();
    const ready = D.YEARS.filter((y) => exams[y]).length;
    view.innerHTML = `
      <section class="card hero">
        <h1>Simulado ENEM 2016 – 2023</h1>
        <p>Oito provas completas, com as 180 questões oficiais de cada edição (45 por área), divididas em Dia 1 e Dia 2, cronômetro de 6 horas por dia, correção automática do gabarito e correção da redação por inteligência artificial nas cinco competências.</p>
        <div class="row" style="margin-top:14px">
          <button class="btn gold" id="dlAll">${ready === D.YEARS.length ? "Atualizar todas as provas" : "Baixar todas as provas para uso offline"}</button>
          <span class="small">${ready}/${D.YEARS.length} provas salvas neste navegador</span>
        </div>
        <div id="dlAllStatus" class="small" style="margin-top:10px"></div>
      </section>

      <section class="card">
        <h2>Como funciona</h2>
        <ol class="muted">
          <li>Na primeira vez, com internet, baixe as provas. Questões, alternativas, gabaritos e imagens ficam guardados no navegador e passam a funcionar offline.</li>
          <li>Abra a aba de um ano e escolha <b>Dia 1</b> (Linguagens, Ciências Humanas e Redação) ou <b>Dia 2</b> (Ciências da Natureza e Matemática).</li>
          <li>Leia o resumo dos tópicos e clique em <b>Iniciar prova</b>. O cronômetro de 6 horas começa e o progresso é salvo automaticamente.</li>
          <li>Vire as páginas com os botões, com as setas ← → do teclado ou deslizando o dedo. Clique com o botão direito numa alternativa para riscá-la.</li>
          <li>Ao finalizar, veja os acertos por área, revise cada questão e peça à IA a correção da redação ou a explicação de uma questão.</li>
        </ol>
      </section>

      <section class="grid">
        ${D.YEARS.map((y) => {
          const s1 = getSess(y, 1), s2 = getSess(y, 2);
          const st = (s) => !s ? "" : s.finished ? '<span class="pill ok">concluído</span>' : '<span class="pill warn">em andamento</span>';
          return `<div class="card year-card">
            <div class="row"><h3>${y}</h3><span class="spacer"></span>${exams[y] ? '<span class="pill ok">offline</span>' : '<span class="pill">não baixada</span>'}</div>
            <div class="theme">Redação: “${esc(D.THEMES[y])}”</div>
            <div class="small" style="margin:8px 0">Dia 1 ${st(s1) || "—"} &nbsp; Dia 2 ${st(s2) || "—"}</div>
            <button class="btn primary" data-open="${y}">Abrir prova</button>
          </div>`;
        }).join("")}
      </section>

      <section class="card">
        <h2>Configurações</h2>
        <div class="grid">
          <label class="field">Língua estrangeira padrão
            <select id="cfgLang"><option value="ingles">Inglês</option><option value="espanhol">Espanhol</option></select></label>
          <label class="field">Modelo de IA
            <input type="text" id="cfgModel" placeholder="${AI.DEFAULT_MODEL}" value="${esc(c.model || "")}"></label>
          <label class="field">Chave de API (opcional, substitui a chave embutida)
            <input type="password" id="cfgKey" placeholder="usando a chave embutida" value="${esc(c.apiKey || "")}"></label>
        </div>
        <div class="row" style="margin-top:14px">
          <button class="btn" id="cfgSave">Salvar configurações</button>
          <span class="spacer"></span>
          <button class="btn" id="exportBtn">Exportar pacote offline</button>
          <label class="btn">Importar pacote<input type="file" id="importFile" accept=".json,application/json" hidden></label>
          <button class="btn danger" id="resetBtn">Apagar progresso</button>
        </div>
        <p class="small muted">O pacote exportado (.json) leva as provas para outro computador ou navegador sem precisar baixar de novo. As imagens são baixadas novamente no primeiro uso online.</p>
      </section>`;

    $("#cfgLang").value = c.lang || "ingles";
    $$("[data-open]").forEach((b) => (b.onclick = () => go(b.dataset.open)));
    $("#cfgSave").onclick = () => { setCfg({ lang: $("#cfgLang").value, model: $("#cfgModel").value.trim(), apiKey: $("#cfgKey").value.trim() }); toast("Configurações salvas."); };
    $("#dlAll").onclick = async () => {
      const st = $("#dlAllStatus"); $("#dlAll").disabled = true;
      for (const y of D.YEARS) {
        try {
          await download(y, (p) => { st.innerHTML = `<span class="spinner"></span> ENEM ${y}: ${p.fase === "questoes" ? "questões" : "imagens"} ${p.feito}/${p.total}`; });
        } catch (e) { st.textContent = `ENEM ${y}: falhou (${e.message}). Continuando…`; }
      }
      st.textContent = "Pronto! Provas salvas para uso offline.";
      renderHome();
    };
    $("#exportBtn").onclick = async () => {
      const pkg = await API.exportAll(D.YEARS);
      if (!pkg.exams.length) return toast("Nenhuma prova baixada ainda.");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(pkg)], { type: "application/json" }));
      a.download = "simulado-enem-pacote.json"; a.click();
    };
    $("#importFile").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const yrs = await API.importJSON(JSON.parse(await f.text()));
        yrs.forEach((y) => delete exams[y]);
        toast("Importado: " + yrs.join(", ")); renderHome();
      } catch (err) { toast("Falha ao importar: " + err.message); }
    };
    $("#resetBtn").onclick = () => {
      if (!confirm("Apagar todas as respostas, cronômetros e correções? As provas baixadas continuam salvas.")) return;
      Object.keys(localStorage).filter((k) => k.startsWith(`sim:u:${USER}:sessao:`)).forEach((k) => localStorage.removeItem(k));
      toast("Progresso apagado."); renderHome();
    };
  }

  async function download(year, onProgress) {
    downloading[year] = true;
    try {
      const data = await API.downloadYear(year, onProgress);
      exams[year] = data;
      return data;
    } finally { delete downloading[year]; renderTabs(); }
  }

  /* ---------- Aba de um ano ---------- */
  function renderYear(year) {
    const day = ui.sub[year] || 1;
    const sub = [1, 2].map((d) => `<button class="subtab ${d === day ? "active" : ""}" data-day="${d}">${D.DAYS[d].titulo}<small>${D.DAYS[d].sub}</small></button>`).join("");
    view.innerHTML = `<div class="row"><h1 style="margin-right:12px">ENEM ${year}</h1><span class="spacer"></span></div>
      <div class="subtabs" role="tablist">${sub}</div><div id="dayView"></div>`;
    $$(".subtab").forEach((b) => (b.onclick = () => { ui.sub[year] = Number(b.dataset.day); saveUI(); stopTimer(); renderYear(year); }));
    renderDay(year, day);
  }

  function renderDay(year, day) {
    const box = $("#dayView");
    if (!exams[year]) return renderDownload(box, year, day);
    const s = getSess(year, day);
    if (!s || !s.started) return renderBriefing(box, year, day);
    if (!s.finished) return renderExam(box, year, day);
    return renderResults(box, year, day);
  }

  function renderDownload(box, year, day) {
    box.innerHTML = `<div class="card">
      <h2>Prova ainda não baixada</h2>
      <p class="muted">Conecte-se à internet uma vez para buscar as 180 questões, as imagens e o gabarito oficial do ENEM ${year}. Depois disso, tudo funciona offline.</p>
      <button class="btn primary" id="dlOne">Baixar ENEM ${year}</button>
      <div style="margin-top:14px"><div class="progress"><i id="dlBar"></i></div><p class="small muted" id="dlTxt"></p></div>
    </div>`;
    $("#dlOne").onclick = async () => {
      $("#dlOne").disabled = true;
      try {
        await download(year, (p) => {
          $("#dlBar") && ($("#dlBar").style.width = (100 * p.feito / Math.max(1, p.total)) + "%");
          $("#dlTxt") && ($("#dlTxt").textContent = p.fase === "questoes" ? `Questões: ${p.feito} de ${p.total}` : `Imagens: ${p.feito} de ${p.total}${p.falhas ? ` (${p.falhas} ficarão só online)` : ""}`);
        });
        toast(`ENEM ${year} salvo para uso offline.`);
        renderYear(year);
      } catch (e) {
        $("#dlOne").disabled = false;
        $("#dlTxt").textContent = "Não foi possível baixar: " + e.message + ". Verifique a conexão e tente de novo.";
      }
    };
  }

  /* Resumo dos tópicos antes da prova */
  function briefingHTML(year, day) {
    const T = D.TOPICS;
    const keys = ["interpretacao", ...D.DAYS[day].areas, ...(D.DAYS[day].redacao ? ["redacao"] : [])];
    const topics = keys.map((k) => `<div class="topic"><h3>${T[k].titulo}</h3><ul>${T[k].itens.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("");
    const comps = D.DAYS[day].redacao ? `
      <h2 style="margin-top:22px">Competências avaliadas na redação</h2>
      <p class="muted small">Cada competência vale de 0 a 200 pontos, em níveis de 40 em 40, somando até 1000 pontos.</p>
      <div class="comp-list">${D.COMPETENCIAS.map((c) => `<div class="comp"><b>${c.nome}</b><span>${esc(c.desc)}</span></div>`).join("")}</div>
      <p style="margin-top:12px"><span class="pill">Tema de ${year}</span> <em style="font-family:var(--serif)">“${esc(D.THEMES[year])}”</em></p>` : "";
    return `<h2>O que você precisa dominar</h2><div class="topics">${topics}</div>${comps}`;
  }

  function renderBriefing(box, year, day) {
    const langs = langsAvailable(year);
    const lang = cfg().lang || "ingles";
    const qs = questionsFor(year, day, langs.includes(lang) ? lang : langs[0]);
    const counts = D.DAYS[day].areas.map((a) => `${D.AREAS[a].curto}: ${qs.filter((q) => q.discipline === a).length} questões`).join(" · ");
    const faltam = 90 - qs.length;
    box.innerHTML = `<div class="card">${briefingHTML(year, day)}</div>
      <div class="card">
        <h2>Pronto para começar?</h2>
        <p class="muted">${counts}${D.DAYS[day].redacao ? " · Redação" : ""} · Tempo: 6 horas</p>
        ${faltam > 0 ? `<p class="small"><span class="pill warn">Aviso</span> A base de questões usada pelo simulador não tem ${faltam} ${faltam === 1 ? "questão" : "questões"} deste dia. ${faltam === 1 ? "Ela fica" : "Elas ficam"} de fora da prova e da contagem de acertos.</p>` : ""}
        ${day === 1 && langs.length ? `<label class="field" style="max-width:260px;margin-bottom:14px">Língua estrangeira
          <select id="langSel">${langs.map((l) => `<option value="${l}" ${l === lang ? "selected" : ""}>${l === "ingles" ? "Inglês" : l === "espanhol" ? "Espanhol" : l}</option>`).join("")}</select></label>` : ""}
        <div class="row">
          <button class="btn primary" id="startBtn">Iniciar prova · 6:00:00</button>
          <button class="btn ghost" id="redlBtn">Baixar novamente</button>
        </div>
      </div>`;
    $("#startBtn").onclick = () => {
      const l = $("#langSel") ? $("#langSel").value : lang;
      setSess(year, day, { started: true, lang: l, elapsed: 0, runningSince: Date.now(), answers: {}, struck: {}, marked: [], page: 0, redacao: { titulo: "", texto: "" }, finished: false });
      renderDay(year, day);
    };
    $("#redlBtn").onclick = async () => { await API.delExam(year); delete exams[year]; render(); };
  }

  /* ---------- Prova em andamento ---------- */
  function elapsedOf(s) { return s.elapsed + (s.runningSince ? (Date.now() - s.runningSince) / 1000 : 0); }
  function stopTimer() { clearInterval(timerHandle); timerHandle = null; }

  function renderExam(box, year, day) {
    const s = getSess(year, day);
    const qs = questionsFor(year, day, s.lang);
    const pages = qs.map((q) => ({ type: "q", q }));
    if (D.DAYS[day].redacao) pages.push({ type: "redacao" });
    if (s.page >= pages.length) s.page = 0;

    box.innerHTML = `
      <div class="exam-head">
        <span class="timer" id="timer">--:--:--</span>
        <button class="btn ghost small" id="pauseBtn">${s.runningSince ? "Pausar" : "Retomar"}</button>
        <div class="progress" title="Respondidas"><i id="ansBar"></i></div>
        <span class="small" id="ansTxt"></span>
        <button class="btn small" id="gridBtn">Questões</button>
        <button class="btn small" id="topicsBtn">Tópicos</button>
        ${D.DAYS[day].redacao ? '<button class="btn small" id="essayBtn">Redação</button>' : ""}
        <button class="btn primary small" id="finishBtn">Finalizar</button>
      </div>
      <div class="book" id="book"><article class="page" id="page"></article></div>
      <div class="pager">
        <button class="btn" id="prevBtn">← Anterior</button>
        <span class="small muted" id="pageTxt"></span>
        <button class="btn primary" id="nextBtn">Próxima →</button>
      </div>`;

    const persist = () => setSess(year, day, s);
    function updateHead() {
      const n = qs.filter((q) => s.answers[qKey(q)]).length;
      $("#ansBar").style.width = (100 * n / Math.max(1, qs.length)) + "%";
      $("#ansTxt").textContent = `${n}/${qs.length}`;
    }
    function tick() {
      const left = D.EXAM_SECONDS - elapsedOf(s);
      const t = $("#timer"); if (!t) return stopTimer();
      t.textContent = fmtTime(left);
      t.classList.toggle("low", left < 30 * 60);
      if (left <= 0) { stopTimer(); toast("Tempo esgotado! A prova foi finalizada."); finish(); }
    }
    stopTimer(); tick(); timerHandle = setInterval(tick, 1000);

    $("#pauseBtn").onclick = () => {
      if (s.runningSince) { s.elapsed = elapsedOf(s); s.runningSince = null; $("#pauseBtn").textContent = "Retomar"; }
      else { s.runningSince = Date.now(); $("#pauseBtn").textContent = "Pausar"; }
      persist(); tick();
    };

    function drawPage() {
      const p = pages[s.page];
      const el = $("#page");
      $("#pageTxt").textContent = p.type === "q" ? `Página ${s.page + 1} de ${pages.length}` : "Folha de redação";
      $("#prevBtn").disabled = s.page === 0;
      $("#nextBtn").textContent = s.page === pages.length - 1 ? "Finalizar" : "Próxima →";
      if (p.type === "redacao") { el.style.setProperty("--page-color", "var(--accent-2)"); el.innerHTML = essayHTML(year, s); bindEssay(el, s, persist); return; }
      const q = p.q, area = D.AREAS[q.discipline], k = qKey(q);
      el.style.setProperty("--page-color", area.cor);
      const marked = s.marked.includes(k);
      el.innerHTML = `
        <div class="q-meta">
          <span class="q-num">Questão ${q.index}</span>
          <span class="pill" style="color:${area.cor};background:color-mix(in srgb, ${area.cor} 12%, transparent)">${area.curto}</span>
          ${q.language ? `<span class="pill">${q.language === "ingles" ? "Inglês" : "Espanhol"}</span>` : ""}
          <span class="spacer"></span>
          <button class="btn ghost small" id="markBtn">${marked ? "★ Marcada para revisão" : "☆ Marcar para revisão"}</button>
        </div>
        ${questionBody(q)}
        <div class="alts">${q.alternatives.map((a) => {
          const sel = s.answers[k] === a.letter, st = (s.struck[k] || []).includes(a.letter);
          return `<button class="alt ${sel ? "selected" : ""} ${st ? "struck" : ""}" data-l="${a.letter}">
            <span class="letter">${a.letter}</span><span class="alt-body">${a.text ? md(a.text) : ""}${a.file ? `<img data-src="${esc(a.file)}" alt="Alternativa ${a.letter}">` : ""}${!a.text && !a.file ? `Alternativa ${a.letter}` : ""}</span></button>`;
        }).join("")}</div>
        <p class="hint">Dica: clique com o botão direito (ou mantenha pressionado) numa alternativa para riscá-la. Teclas A–E marcam a resposta.</p>`;
      hydrateImages(el);
      $("#markBtn").onclick = () => {
        s.marked = marked ? s.marked.filter((x) => x !== k) : [...s.marked, k]; persist(); drawPage();
      };
      $$(".alt", el).forEach((b) => {
        b.onclick = () => { const L = b.dataset.l; s.answers[k] = s.answers[k] === L ? undefined : L; if (!s.answers[k]) delete s.answers[k]; persist(); updateHead(); drawPage(); };
        b.oncontextmenu = (e) => { e.preventDefault(); const L = b.dataset.l; const arr = s.struck[k] || []; s.struck[k] = arr.includes(L) ? arr.filter((x) => x !== L) : [...arr, L]; persist(); drawPage(); };
      });
    }

    let busy = false;
    function goTo(i) {
      if (busy || i < 0 || i >= pages.length || i === s.page) return;
      const dir = i > s.page ? "next" : "prev";
      const el = $("#page"); busy = true;
      el.classList.add("turn-out-" + dir);
      setTimeout(() => {
        el.classList.remove("turn-out-" + dir);
        s.page = i; persist(); drawPage();
        el.classList.add("turn-in-" + dir);
        window.scrollTo({ top: 0, behavior: "smooth" });
        setTimeout(() => { el.classList.remove("turn-in-" + dir); busy = false; }, 430);
      }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 360);
    }
    $("#prevBtn").onclick = () => goTo(s.page - 1);
    $("#nextBtn").onclick = () => s.page === pages.length - 1 ? confirmFinish() : goTo(s.page + 1);
    $("#essayBtn") && ($("#essayBtn").onclick = () => goTo(pages.length - 1));
    $("#topicsBtn").onclick = () => modal(briefingHTML(year, day));
    $("#gridBtn").onclick = () => {
      const byArea = D.DAYS[day].areas.map((a) => `<div class="qgrid-area">${D.AREAS[a].nome}</div><div class="qgrid">${
        pages.map((p, i) => p.type === "q" && p.q.discipline === a ? `<button data-i="${i}" class="${s.answers[qKey(p.q)] ? "answered" : ""} ${s.marked.includes(qKey(p.q)) ? "marked" : ""} ${i === s.page ? "current" : ""}">${p.q.index}</button>` : "").join("")}</div>`).join("");
      modal(`<h2>Mapa de questões</h2><p class="small muted">Azul = respondida · linha dourada = marcada para revisão</p>${byArea}`);
      $$("#modalBody [data-i]").forEach((b) => (b.onclick = () => { closeModal(); goTo(Number(b.dataset.i)); }));
    };
    $("#finishBtn").onclick = confirmFinish;

    function confirmFinish() {
      const blank = qs.filter((q) => !s.answers[qKey(q)]).length;
      const essayEmpty = D.DAYS[day].redacao && !(s.redacao.texto || "").trim();
      modal(`<h2>Finalizar o ${D.DAYS[day].titulo}?</h2>
        <p>${blank ? `Você deixou <b>${blank}</b> questões em branco.` : "Todas as questões foram respondidas."}${essayEmpty ? " A redação está em branco." : ""}</p>
        <p class="muted small">Depois de finalizar, as respostas não podem mais ser alteradas.</p>
        <div class="row"><button class="btn" id="cancelF">Continuar a prova</button><button class="btn primary" id="okF">Finalizar e ver resultado</button></div>`);
      $("#cancelF").onclick = closeModal;
      $("#okF").onclick = () => { closeModal(); finish(); };
    }
    function finish() {
      stopTimer();
      s.elapsed = elapsedOf(s); s.runningSince = null;
      s.finished = true; s.finishedAt = new Date().toISOString(); s.page = 0;
      s.result = computeResult(qs, s);
      persist(); renderDay(year, day);
    }

    // teclado e gesto
    document.onkeydown = (e) => {
      if (!$("#page") || !$("#modal").hidden) return;
      if (/textarea|input|select/i.test(document.activeElement.tagName)) return;
      if (e.key === "ArrowRight") goTo(s.page + 1);
      else if (e.key === "ArrowLeft") goTo(s.page - 1);
      else if (/^[a-e]$/i.test(e.key) && pages[s.page].type === "q") { const b = $(`.alt[data-l="${e.key.toUpperCase()}"]`); b && b.click(); }
    };
    let tx = null;
    $("#book").addEventListener("touchstart", (e) => (tx = e.touches[0].clientX), { passive: true });
    $("#book").addEventListener("touchend", (e) => {
      if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; tx = null;
      if (Math.abs(dx) > 70) goTo(s.page + (dx < 0 ? 1 : -1));
    });

    updateHead(); drawPage();
  }

  function questionBody(q) {
    if (q.externa) {
      return `<div class="externa">
        <p><span class="pill warn">Enunciado na fonte de correção</span></p>
        <p>Esta questão não está na base pública que o simulador usa. Abra o enunciado no site <b>${esc(q.externa.fonte)}</b> (caderno azul do ENEM ${q.year}), resolva e marque sua resposta abaixo. Ela conta no tempo, no mapa de questões e no resultado como as demais.</p>
        <p><a class="btn" href="${esc(q.externa.url)}" target="_blank" rel="noopener">Abrir o enunciado da questão ${q.index} ↗</a></p>
        <p class="small muted">É preciso estar conectado à internet para ver esse enunciado.</p>
      </div>`;
    }
    const inline = new Set(); const re = /!\[[^\]]*\]\(([^)\s]+)/g; let m;
    [q.context, q.alternativesIntroduction].forEach((t) => { if (t) while ((m = re.exec(t))) inline.add(m[1]); });
    const extra = (q.files || []).filter((u) => u && !inline.has(u)).map((u) => `<img data-src="${esc(u)}" alt="Imagem da questão ${q.index}">`).join("");
    return `<div class="q-text">${md(q.context)}${extra}</div>${q.alternativesIntroduction ? `<div class="q-intro">${md(q.alternativesIntroduction)}</div>` : ""}`;
  }

  /* ---------- Redação ---------- */
  function essayHTML(year, s, readonly) {
    return `<div class="q-meta"><span class="q-num">Redação</span><span class="pill">Texto dissertativo-argumentativo</span></div>
      <p style="font-family:var(--serif)">Com base em seus conhecimentos construídos ao longo de sua formação, redija um texto dissertativo-argumentativo em modalidade escrita formal da língua portuguesa sobre o tema:</p>
      <h3 style="font-size:1.25rem">“${esc(D.THEMES[year])}”</h3>
      <p class="small muted">Apresente proposta de intervenção que respeite os direitos humanos. Selecione, organize e relacione, de forma coerente e coesa, argumentos e fatos para defesa de seu ponto de vista. Máximo de 30 linhas; até 7 linhas a redação recebe nota zero.</p>
      <input type="text" class="essay-title" id="essayTitle" placeholder="Título (opcional)" value="${esc(s.redacao.titulo)}" ${readonly ? "readonly" : ""}>
      <div class="essay-wrap"><div class="essay-lines" id="essayLines"></div>
        <textarea class="essay" id="essay" spellcheck="false" placeholder="Escreva sua redação aqui…" ${readonly ? "readonly" : ""}>${esc(s.redacao.texto)}</textarea></div>
      <p class="small muted" id="essayCount"></p>`;
  }
  function bindEssay(root, s, persist) {
    const ta = $("#essay", root), lines = $("#essayLines", root), cnt = $("#essayCount", root);
    const upd = () => {
      // estima linhas visuais (~78 caracteres por linha manuscrita)
      const visual = ta.value.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 78)), 0);
      const n = Math.max(30, visual);
      lines.textContent = Array.from({ length: n }, (_, i) => i + 1).join("\n");
      lines.style.height = ta.offsetHeight + "px";
      const words = (ta.value.match(/\S+/g) || []).length;
      cnt.innerHTML = `${words} palavras · ≈ ${visual} linhas ${visual > 30 ? '<span class="pill bad">acima de 30 linhas</span>' : visual <= 7 && words ? '<span class="pill warn">até 7 linhas: nota zero</span>' : ""}`;
    };
    ta.addEventListener("input", () => { s.redacao.texto = ta.value; persist && persist(); upd(); });
    ta.addEventListener("scroll", () => (lines.scrollTop = ta.scrollTop));
    const ti = $("#essayTitle", root); ti && ti.addEventListener("input", () => { s.redacao.titulo = ti.value; persist && persist(); });
    new ResizeObserver(upd).observe(ta);
    upd();
  }

  /* ---------- Resultado ---------- */
  function computeResult(qs, s) {
    const areas = {};
    qs.forEach((q) => {
      const a = areas[q.discipline] || (areas[q.discipline] = { acertos: 0, erros: 0, brancos: 0, total: 0 });
      const ans = s.answers[qKey(q)]; a.total++;
      if (!ans) a.brancos++; else if (ans === q.correctAlternative) a.acertos++; else a.erros++;
    });
    return { areas, acertos: Object.values(areas).reduce((n, a) => n + a.acertos, 0), total: qs.length };
  }

  function renderResults(box, year, day) {
    const s = getSess(year, day);
    const qs = questionsFor(year, day, s.lang);
    const r = s.result || computeResult(qs, s);
    const areaCards = Object.entries(r.areas).map(([k, a]) => `
      <div class="area-res" style="--c:${D.AREAS[k].cor}">
        <div class="small muted">${D.AREAS[k].nome}</div>
        <div class="big">${a.acertos}<span class="muted" style="font-size:1rem"> / ${a.total}</span></div>
        <div class="progress"><i style="width:${100 * a.acertos / a.total}%;background:${D.AREAS[k].cor}"></i></div>
        <div class="small muted" style="margin-top:6px">${a.erros} erros · ${a.brancos} em branco · ${Math.round(100 * a.acertos / a.total)}% de acerto</div>
      </div>`).join("");

    box.innerHTML = `
      <div class="card">
        <div class="row"><h2>Resultado do ${D.DAYS[day].titulo}</h2><span class="spacer"></span>
          <span class="pill">Tempo usado: ${fmtTime(s.elapsed)}</span></div>
        <p class="muted small">Contagem de acertos pelo gabarito oficial. A nota oficial do ENEM usa a Teoria de Resposta ao Item, que não pode ser reproduzida aqui com exatidão.</p>
        <div class="area-results">${areaCards}</div>
        <div class="row" style="margin-top:16px">
          <button class="btn primary" id="reviewBtn">Revisar questões</button>
          <button class="btn" id="redoBtn">Refazer este dia</button>
        </div>
      </div>
      ${D.DAYS[day].redacao ? `<div class="card" id="essayCard"></div>` : ""}
      <div id="reviewBox"></div>`;

    $("#redoBtn").onclick = () => {
      if (!confirm("Apagar as respostas deste dia e recomeçar?")) return;
      localStorage.removeItem(sessKey(year, day)); renderDay(year, day);
    };
    $("#reviewBtn").onclick = () => renderReview($("#reviewBox"), year, day, qs, s, 0);
    if (D.DAYS[day].redacao) renderEssayResult($("#essayCard"), year, day, s);
  }

  function renderEssayResult(card, year, day, s) {
    const av = s.redacaoAval;
    const texto = (s.redacao.texto || "").trim();
    card.innerHTML = `<div class="row"><h2>Redação</h2><span class="spacer"></span>
        <button class="btn gold" id="aiEssay" ${texto ? "" : "disabled"}>${av ? "Corrigir novamente com IA" : "Corrigir com IA"}</button></div>
      <p class="muted small">Tema: “${esc(D.THEMES[year])}”</p>
      ${!texto ? '<p class="muted">A redação ficou em branco.</p>' : ""}
      <div id="essayAval">${av ? avalHTML(av) : ""}</div>
      <details style="margin-top:12px"><summary>Ver o texto enviado</summary><div class="q-text" style="margin-top:10px">${s.redacao.titulo ? `<p><strong>${esc(s.redacao.titulo)}</strong></p>` : ""}${md(texto)}</div></details>`;
    $("#aiEssay").onclick = async () => {
      const b = $("#aiEssay"); b.disabled = true; b.innerHTML = '<span class="spinner"></span> Corrigindo…';
      try {
        const res = await AI.corrigirRedacao({ tema: D.THEMES[year], texto: (s.redacao.titulo ? s.redacao.titulo + "\n\n" : "") + texto, ano: year });
        s.redacaoAval = res; setSess(year, day, s);
        renderEssayResult(card, year, day, s);
      } catch (e) {
        b.disabled = false; b.textContent = "Tentar novamente";
        $("#essayAval").innerHTML = `<div class="ai-box">${esc(e.message)}\n\nVerifique a conexão ou informe outra chave/modelo em Início › Configurações.</div>`;
      }
    };
  }
  function avalHTML(av) {
    return `<div class="row" style="align-items:flex-end;margin:10px 0 16px"><div class="score-total">${av.total}</div><div class="muted">de 1000 pontos</div></div>
      ${av.anulada ? `<div class="ai-box"><b>Redação anulada.</b> ${esc(av.motivoAnulacao)}</div>` : ""}
      ${av.competencias.map((c) => `<div class="comp-score">
        <h4><span>${c.nome}</span><span>${c.nota} / 200</span></h4>
        <div class="small muted">${esc(c.desc)}</div>
        <div class="bar"><i style="width:${c.nota / 2}%"></i></div>
        ${c.nivel ? `<p class="small"><b>Nível de desempenho:</b> ${esc(c.nivel)}</p>` : ""}
        <p>${esc(c.justificativa)}</p>
        ${c.comoMelhorar ? `<p class="small"><b>Como melhorar:</b> ${esc(c.comoMelhorar)}</p>` : ""}
      </div>`).join("")}
      ${av.parecerGeral ? `<h3>Parecer geral</h3><p style="font-family:var(--serif)">${esc(av.parecerGeral)}</p>` : ""}
      <div class="grid">
        ${av.pontosFortes.length ? `<div><h3>Pontos fortes</h3><ul>${av.pontosFortes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
        ${av.pontosAMelhorar.length ? `<div><h3>Pontos a melhorar</h3><ul>${av.pontosAMelhorar.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      </div>
      <p class="small muted">Correção gerada por inteligência artificial em ${new Date(av.corrigidaEm).toLocaleString("pt-BR")}. É uma estimativa e não substitui a correção oficial.</p>`;
  }

  function renderReview(box, year, day, qs, s, i) {
    const grid = D.DAYS[day].areas.map((a) => `<div class="qgrid-area">${D.AREAS[a].nome}</div><div class="qgrid">${
      qs.map((q, j) => q.discipline !== a ? "" : `<button data-j="${j}" class="${!s.answers[qKey(q)] ? "" : s.answers[qKey(q)] === q.correctAlternative ? "ok" : "bad"} ${j === i ? "current" : ""}">${q.index}</button>`).join("")}</div>`).join("");
    const q = qs[i], k = qKey(q), mine = s.answers[k], area = D.AREAS[q.discipline];
    box.innerHTML = `<div class="card"><h2>Revisão</h2><p class="small muted">Verde = acerto · vermelho = erro · cinza = em branco</p>${grid}</div>
      <div class="book"><article class="page turn-in-next" style="--page-color:${area.cor}">
        <div class="q-meta"><span class="q-num">Questão ${q.index}</span><span class="pill">${area.curto}</span>
          ${!mine ? '<span class="pill warn">em branco</span>' : mine === q.correctAlternative ? '<span class="pill ok">acertou</span>' : `<span class="pill bad">marcou ${mine}</span>`}
          <span class="pill ok">gabarito ${q.correctAlternative}</span></div>
        ${questionBody(q)}
        <div class="alts">${q.alternatives.map((a) => `<div class="alt ${a.letter === q.correctAlternative ? "correct" : a.letter === mine ? "wrong" : ""}">
          <span class="letter">${a.letter}</span><span class="alt-body">${a.text ? md(a.text) : ""}${a.file ? `<img data-src="${esc(a.file)}" alt="Alternativa ${a.letter}">` : ""}${!a.text && !a.file ? `Alternativa ${a.letter}` : ""}</span></div>`).join("")}</div>
        ${q.externa ? `<p class="small muted" style="margin-top:16px">A resolução comentada desta questão está na fonte: <a href="${esc(q.externa.url)}" target="_blank" rel="noopener">${esc(q.externa.fonte)} ↗</a></p>` : `<div class="row" style="margin-top:16px"><button class="btn gold" id="explain">Explicar com IA</button></div>`}
        <div id="explainBox"></div>
      </article></div>
      <div class="pager"><button class="btn" id="rPrev" ${i === 0 ? "disabled" : ""}>← Anterior</button>
        <span class="small muted">${i + 1} de ${qs.length}</span>
        <button class="btn primary" id="rNext" ${i === qs.length - 1 ? "disabled" : ""}>Próxima →</button></div>`;
    hydrateImages(box);
    const goR = (j) => { renderReview(box, year, day, qs, s, j); box.querySelector(".book").scrollIntoView({ behavior: "smooth" }); };
    $$("[data-j]", box).forEach((b) => (b.onclick = () => goR(Number(b.dataset.j))));
    $("#rPrev").onclick = () => goR(i - 1);
    $("#rNext").onclick = () => goR(i + 1);
    document.onkeydown = (e) => {
      if (/textarea|input|select/i.test(document.activeElement.tagName) || !$("#rNext")) return;
      if (e.key === "ArrowRight" && i < qs.length - 1) goR(i + 1);
      if (e.key === "ArrowLeft" && i > 0) goR(i - 1);
    };
    s.explicacoes = s.explicacoes || {};
    if (s.explicacoes[k]) $("#explainBox").innerHTML = `<div class="ai-box md">${md(s.explicacoes[k])}</div>`;
    $("#explain") && ($("#explain").onclick = async () => {
      const b = $("#explain"); b.disabled = true; b.innerHTML = '<span class="spinner"></span> Pensando…';
      try {
        const t = await AI.explicarQuestao({ q, marcada: mine, area: area.nome });
        s.explicacoes[k] = t; setSess(year, day, s);
        $("#explainBox").innerHTML = `<div class="ai-box md">${md(t)}</div>`;
      } catch (e) { $("#explainBox").innerHTML = `<div class="ai-box">${esc(e.message)}</div>`; }
      b.disabled = false; b.textContent = "Explicar com IA";
    });
  }

  /* ---------- Desempenho ---------- */
  function renderPerformance() {
    const rows = D.YEARS.map((y) => {
      const s1 = getSess(y, 1), s2 = getSess(y, 2);
      const a = (s, k) => s && s.finished && s.result && s.result.areas[k] ? `${s.result.areas[k].acertos}/${s.result.areas[k].total}` : "—";
      const red = s1 && s1.redacaoAval ? s1.redacaoAval.total : "—";
      const tot = [s1, s2].filter((s) => s && s.finished && s.result).reduce((n, s) => n + s.result.acertos, 0);
      return `<tr><td><b>${y}</b></td><td class="num">${a(s1, "linguagens")}</td><td class="num">${a(s1, "ciencias-humanas")}</td>
        <td class="num">${a(s2, "ciencias-natureza")}</td><td class="num">${a(s2, "matematica")}</td><td class="num">${red}</td><td class="num">${tot || "—"}</td></tr>`;
    }).join("");
    const sums = {}; let redSum = 0, redN = 0;
    D.YEARS.forEach((y) => [1, 2].forEach((d) => {
      const s = getSess(y, d);
      if (s && s.finished && s.result) Object.entries(s.result.areas).forEach(([k, a]) => { sums[k] = sums[k] || { ac: 0, t: 0 }; sums[k].ac += a.acertos; sums[k].t += a.total; });
      if (d === 1 && s && s.redacaoAval) { redSum += s.redacaoAval.total; redN++; }
    }));
    const avg = Object.keys(D.AREAS).map((k) => `<div class="area-res" style="--c:${D.AREAS[k].cor}"><div class="small muted">${D.AREAS[k].nome}</div>
      <div class="big">${sums[k] ? Math.round(100 * sums[k].ac / sums[k].t) + "%" : "—"}</div><div class="small muted">${sums[k] ? `${sums[k].ac} acertos em ${sums[k].t} questões` : "nenhuma prova concluída"}</div></div>`).join("");
    view.innerHTML = `<div class="card"><h1>Desempenho geral</h1><p class="muted">Percentual de acerto acumulado em todas as provas concluídas.</p>
      <div class="area-results">${avg}<div class="area-res" style="--c:var(--accent-2)"><div class="small muted">Redação (média)</div><div class="big">${redN ? Math.round(redSum / redN) : "—"}</div><div class="small muted">${redN} redações corrigidas</div></div></div></div>
      <div class="card" style="overflow-x:auto"><table class="table"><thead><tr><th>Edição</th><th>Linguagens</th><th>Humanas</th><th>Natureza</th><th>Matemática</th><th>Redação</th><th>Acertos</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* ---------- tema claro/escuro ---------- */
  const applyTheme = (t) => document.documentElement.setAttribute("data-theme", t);
  applyTheme(load("sim:tema", matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  $("#themeToggle").onclick = () => {
    const t = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(t); save("sim:tema", t);
  };

  // Garante que o cronômetro conte o tempo real mesmo com a aba fechada (o tempo corre enquanto "runningSince" existir).
  /* ---------- Login (perfis locais, salvos neste navegador) ---------- */
  const normUser = (t) => String(t || "").trim().split(/\s+/)[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const users = () => load("sim:usuarios", {});
  async function hashSenha(salt, senha) {
    const data = new TextEncoder().encode(salt + ":" + senha);
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", data);
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    let h = 2166136261; for (const b of data) { h ^= b; h = Math.imul(h, 16777619) >>> 0; } return "f" + h.toString(16);
  }
  const anoValido = (a) => /^\d{4}$/.test(a) && +a >= 1900 && +a <= new Date().getFullYear();

  function entrar(u) {
    USER = u; save("sim:usuarioAtivo", u);
    ui = load(`sim:u:${u}:ui`, { tab: "inicio", sub: {} });
      $("#login").hidden = true;
    const info = users()[u] || {};
    $("#userBox").innerHTML = `<span class="small">Olá, <b>${esc(info.nome ? info.nome.split(" ")[0] : u)}</b></span> <button class="btn small ghost" id="logoutBtn">Sair</button>`;
    $("#logoutBtn").onclick = sair;
    render();
  }
  function sair() {
    stopTimer(); USER = null; localStorage.removeItem("sim:usuarioAtivo");
    $("#userBox").innerHTML = ""; view.innerHTML = ""; $("#tabs").innerHTML = "";
    mostrarLogin("entrar");
  }
  function mostrarLogin(modo) {
    const box = $("#login"); box.hidden = false;
    const criar = modo === "criar";
    box.innerHTML = `<div class="login-card card">
      <div class="brand" style="margin-bottom:14px"><span class="brand-mark">E</span><div><strong>Simulado ENEM</strong><small>${criar ? "Criar conta" : "Entrar"}</small></div></div>
      <div class="subtabs" style="margin-bottom:16px">
        <button class="subtab ${!criar ? "active" : ""}" data-m="entrar">Entrar</button>
        <button class="subtab ${criar ? "active" : ""}" data-m="criar">Criar conta</button>
      </div>
      <form id="loginForm" autocomplete="off" novalidate>
        ${criar ? `<label class="field">Nome completo<input type="text" id="lgNome" required placeholder="Ex.: Maria Souza"></label>
          <p class="small muted" id="lgPrev" style="margin:6px 0 12px">Seu usuário será o primeiro nome em minúsculas.</p>` :
          `<label class="field">Usuário (primeiro nome, minúsculo)<input type="text" id="lgUser" required placeholder="ex.: maria" autocapitalize="none"></label>`}
        <label class="field" style="margin-top:10px">Senha (ano de nascimento, 4 dígitos)<input type="password" id="lgSenha" required inputmode="numeric" maxlength="4" pattern="\\d{4}" placeholder="ex.: 2007"></label>
        <p class="small" id="lgMsg" style="color:var(--bad);min-height:1.4em;margin:10px 0"></p>
        <button class="btn primary" type="submit" style="width:100%">${criar ? "Criar conta e entrar" : "Entrar"}</button>
      </form>
      <p class="small muted" style="margin-top:14px">O progresso de cada pessoa fica salvo neste navegador, separado por usuário. As provas baixadas são compartilhadas entre os usuários.</p>
    </div>`;
    $$("[data-m]", box).forEach((b) => (b.onclick = () => mostrarLogin(b.dataset.m)));
    const msg = (t) => ($("#lgMsg").textContent = t);
    if (criar) $("#lgNome").oninput = () => { const u = normUser($("#lgNome").value); $("#lgPrev").innerHTML = u ? `Seu usuário será: <b>${esc(u)}</b>` : "Seu usuário será o primeiro nome em minúsculas."; };
    $("#loginForm").onsubmit = async (e) => {
      e.preventDefault();
      const senha = $("#lgSenha").value.trim();
      if (!anoValido(senha)) return msg("A senha é o ano de nascimento com 4 dígitos (ex.: 2007).");
      const all = users();
      if (criar) {
        const nome = $("#lgNome").value.trim().replace(/\s+/g, " ");
        const u = normUser(nome);
        if (!u) return msg("Digite seu nome.");
        if (all[u]) return msg(`O usuário "${u}" já existe. Use "Entrar" ou outro nome.`);
        const salt = Math.random().toString(36).slice(2, 10);
        all[u] = { nome, salt, hash: await hashSenha(salt, senha), criadoEm: new Date().toISOString() };
        save("sim:usuarios", all);
        // progresso salvo antes do login passa para a primeira conta criada
        if (Object.keys(all).length === 1) {
          Object.keys(localStorage).filter((k) => k.startsWith("sim:sessao:")).forEach((k) => {
            localStorage.setItem(`sim:u:${u}:` + k.slice(4), localStorage.getItem(k)); localStorage.removeItem(k);
          });
        }
        entrar(u);
      } else {
        const u = normUser($("#lgUser").value);
        const info = all[u];
        if (!info || (await hashSenha(info.salt, senha)) !== info.hash) return msg("Usuário ou senha incorretos.");
        entrar(u);
      }
    };
    setTimeout(() => { const f = $(criar ? "#lgNome" : "#lgUser"); f && f.focus(); }, 50);
  }

  const ativo = load("sim:usuarioAtivo", null);
  if (ativo && users()[ativo]) entrar(ativo);
  else mostrarLogin(Object.keys(users()).length ? "entrar" : "criar");
})();
