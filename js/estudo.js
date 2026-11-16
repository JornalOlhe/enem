/* Matérias (o que mais cai) e Progresso semanal (banco de 1000 questões, exame semanal e relatório). */
(function () {
  const D = window.ENEM_DATA;
  const AREA_ORDEM = ["linguagens", "ciencias-humanas", "matematica", "ciencias-natureza"]; // revezamento
  const BANCO_TOTAL = 1000;
  const POR_AREA_SEMANA = 10;

  const A = () => window.SimApp; // helpers do app (definidos em app.js)
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- utilidades ---------- */
  const norm = (t) => String(t || "").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const qid = (q) => `${q.year}-${q.index}-${q.language || ""}`;
  function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(arr, rand) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function semanaISO(d = new Date()) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dia = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dia);
    const ini = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const n = Math.ceil(((t - ini) / 86400000 + 1) / 7);
    return `${t.getUTCFullYear()}-S${String(n).padStart(2, "0")}`;
  }
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

  /* ---------- todas as questões baixadas (Inglês), com área correta ---------- */
  function todasQuestoes() {
    const out = [];
    for (const y of D.YEARS) {
      if (!A().exams[y]) continue;
      for (const day of [1, 2]) A().questionsFor(y, day, "ingles").forEach((q) => out.push(q));
    }
    return out;
  }
  function mapaPorId() { const m = new Map(); todasQuestoes().forEach((q) => m.set(qid(q), q)); return m; }

  /* ---------- classificação de matérias ---------- */
  const iaCache = () => A().load("sim:topicosIA", {});
  const OUTROS = "Outros assuntos (sem palavra-chave)";
  const defaultTopico = { "matematica": ["Matemática", OUTROS], "ciencias-natureza": ["Ciências da Natureza", OUTROS], "ciencias-humanas": ["Ciências Humanas", OUTROS], "linguagens": ["Língua portuguesa", "Interpretação e gêneros textuais"] };
  const regexCache = {};
  function topicoPorRegra(q) {
    if (q.externa) return { materia: defaultTopico[q.discipline][0], assunto: "Não classificada (enunciado externo)", fonte: "regra" };
    if (q.language) return { materia: "Língua estrangeira", assunto: "Inglês", fonte: "regra" };
    const txt = norm([q.context, q.alternativesIntroduction, ...(q.alternatives || []).map((a) => a.text)].join(" "));
    let best = null, bestN = 0;
    for (const [mat, ass, pat] of D.TOPIC_RULES[q.discipline] || []) {
      if (pat === "__lingua__") continue;
      const re = regexCache[pat] || (regexCache[pat] = new RegExp(pat, "g"));
      const n = (txt.match(re) || []).length;
      if (n > bestN) { best = [mat, ass]; bestN = n; }
    }
    const [materia, assunto] = best || defaultTopico[q.discipline];
    return { materia, assunto, fonte: "regra" };
  }
  function topicoDe(q) {
    const c = iaCache()[qid(q)];
    if (c) { const [materia, assunto] = c.split("|"); return { materia, assunto, fonte: "ia" }; }
    return topicoPorRegra(q);
  }

  // Estatística de assuntos por área (quantas vezes caíram de 2016 a 2023)
  function estatisticaAssuntos(qs) {
    const porArea = {};
    for (const q of qs) {
      const t = topicoDe(q);
      const a = porArea[q.discipline] || (porArea[q.discipline] = { total: 0, assuntos: {} });
      a.total++;
      const k = t.materia + " › " + t.assunto;
      const it = a.assuntos[k] || (a.assuntos[k] = { materia: t.materia, assunto: t.assunto, n: 0, anos: {} });
      it.n++; it.anos[q.year] = (it.anos[q.year] || 0) + 1;
    }
    return porArea;
  }

  let iaRodando = false;
  async function refinarComIA(onProgress) {
    if (iaRodando) return;
    iaRodando = true;
    try {
      const cache = iaCache();
      const pend = todasQuestoes().filter((q) => !q.externa && !q.language && !cache[qid(q)]);
      const lotes = [];
      for (let i = 0; i < pend.length; i += 12) lotes.push(pend.slice(i, i + 12));
      let feitos = 0, erros = 0;
      for (const lote of lotes) {
        try {
          const r = await window.EnemAI.classificarQuestoes(lote.map((q) => ({
            id: qid(q), area: D.AREAS[q.discipline].nome,
            assuntosSugeridos: (D.TOPIC_RULES[q.discipline] || []).filter((x) => x[2] !== "__lingua__").map((x) => x[0] + " › " + x[1]),
            texto: norm([q.context, q.alternativesIntroduction].join(" ")).slice(0, 700),
            alternativas: (q.alternatives || []).map((a) => a.letter + ") " + String(a.text || "[imagem]").slice(0, 90)).join(" | ")
          })));
          const c2 = iaCache();
          for (const it of r) if (it && it.id && it.materia && it.assunto) c2[it.id] = `${String(it.materia).slice(0, 40)}|${String(it.assunto).slice(0, 60)}`;
          A().save("sim:topicosIA", c2);
        } catch (e) {
          erros++;
          if (erros >= 3) throw e;
        }
        feitos++;
        onProgress && onProgress(feitos, lotes.length);
        await new Promise((r) => setTimeout(r, 4500)); // respeita o limite gratuito por minuto
      }
    } finally { iaRodando = false; }
  }

  /* ---------- aba Matérias ---------- */
  function renderMaterias(view) {
    const qs = todasQuestoes();
    if (!qs.length) { view.innerHTML = semProvas(); bindSemProvas(view); return; }
    const est = estatisticaAssuntos(qs);
    const nIA = qs.filter((q) => iaCache()[qid(q)]).length;
    const classificaveis = qs.filter((q) => !q.externa && !q.language).length;
    const anos = D.YEARS.filter((y) => A().exams[y]);
    view.innerHTML = `
      <div class="card">
        <h1>Matérias que mais caem</h1>
        <p class="muted">Cada questão das provas baixadas (${anos.join(", ")}) foi classificada por assunto. Use a lista para estudar primeiro o que mais aparece no ENEM.</p>
        <div class="row">
          <span class="pill ${nIA >= classificaveis ? "ok" : ""}">${nIA} de ${classificaveis} questões analisadas pela IA</span>
          <span class="small muted">As demais usam a classificação automática por palavras-chave.</span>
          <span class="spacer"></span>
          <button class="btn gold" id="iaRefinar" ${nIA >= classificaveis ? "disabled" : ""}>${nIA >= classificaveis ? "Análise da IA concluída" : "Analisar com IA"}</button>
        </div>
        <p class="small" id="iaProg"></p>
      </div>
      ${AREA_ORDEM.map((area) => {
        const a = est[area]; if (!a) return "";
        const itens = Object.values(a.assuntos).sort((x, y) => (x.assunto === OUTROS) - (y.assunto === OUTROS) || y.n - x.n);
        const max = itens[0] ? itens[0].n : 1;
        return `<div class="card">
          <h2 style="color:${D.AREAS[area].cor}">${D.AREAS[area].nome}</h2>
          <p class="small muted">${a.total} questões analisadas. Os três primeiros assuntos são o principal para estudar.</p>
          <div class="tbl-wrap"><table class="table materias">
            <thead><tr><th>Assunto</th><th>Matéria</th><th>Questões</th><th>% da área</th><th>Por ano</th></tr></thead>
            <tbody>${itens.map((it, i) => { const top = i < 3 && it.assunto !== OUTROS; return `<tr ${top ? 'class="top"' : ""}>
              <td><b>${top ? "★ " : ""}${A().esc(it.assunto)}</b><div class="bar"><i style="width:${(100 * it.n) / max}%;background:${D.AREAS[area].cor}"></i></div></td>
              <td>${A().esc(it.materia)}</td><td class="num">${it.n}</td><td class="num">${pct(it.n, a.total)}%</td>
              <td class="small muted">${anos.map((y) => `${String(y).slice(2)}:${it.anos[y] || 0}`).join(" ")}</td></tr>`; }).join("")}</tbody>
          </table></div>
        </div>`;
      }).join("")}`;
    const btn = $("#iaRefinar", view);
    btn && (btn.onclick = async () => {
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Analisando…';
      try {
        await refinarComIA((f, t) => { const el = $("#iaProg"); el && (el.textContent = `Lote ${f} de ${t} analisado (o progresso fica salvo; você pode continuar usando o simulador).`); });
        A().toast("Análise de matérias concluída.");
      } catch (e) { A().toast("A IA não respondeu: " + e.message.split("\n")[0]); }
      if (A().getTab() === "materias") renderMaterias(view);
    });
  }

  /* ---------- Progresso semanal ---------- */
  const chave = () => `sim:u:${A().getUser()}:semanal`;
  const estado = () => A().load(chave(), { banco: [], eliminadas: [], stats: {}, sessoes: [], plano: null });
  const salvar = (s) => A().save(chave(), s);

  // Monta (ou completa) o banco de até 1000 questões do usuário: 250 por área, sorteadas de 2016 a 2023.
  function garantirBanco(s) {
    const qs = todasQuestoes().filter((q) => !q.externa && q.alternatives && q.alternatives.length === 5);
    const usados = new Set([...s.banco, ...s.eliminadas]);
    const rand = rng(hashStr(A().getUser() + ":banco"));
    const porArea = BANCO_TOTAL / 4;
    let mudou = false;
    for (const area of AREA_ORDEM) {
      const ja = [...usados].filter((id) => (s.stats[id] && s.stats[id].area === area) || idArea(id) === area).length;
      const falta = porArea - ja;
      if (falta <= 0) continue;
      const cand = shuffle(qs.filter((q) => q.discipline === area && !usados.has(qid(q))), rand).slice(0, falta);
      cand.forEach((q) => { s.banco.push(qid(q)); usados.add(qid(q)); s.stats[qid(q)] = s.stats[qid(q)] || { area, acertos: 0, erros: 0 }; });
      if (cand.length) mudou = true;
    }
    if (mudou) salvar(s);
    return s;
  }
  let _areaIdx = null;
  function idArea(id) { if (!_areaIdx) { _areaIdx = new Map(); todasQuestoes().forEach((q) => _areaIdx.set(qid(q), q.discipline)); } return _areaIdx.get(id); }

  // Escolhe 10 por área: primeiro as que você errou, depois assuntos mais fracos e mais cobrados, depois inéditas.
  function montarExame(s, tipo) {
    const mapa = mapaPorId();
    const rand = rng(hashStr(A().getUser() + ":" + tipo + ":" + Date.now()));
    const fraqueza = fraquezaPorAssunto(s, mapa);
    const porArea = {};
    for (const area of AREA_ORDEM) {
      const cand = s.banco.filter((id) => mapa.has(id) && mapa.get(id).discipline === area);
      const erradas = shuffle(cand.filter((id) => (s.stats[id] || {}).erros > 0), rand).slice(0, 4);
      const resto = cand.filter((id) => !erradas.includes(id)).map((id) => {
        const q = mapa.get(id), t = topicoDe(q); const f = fraqueza[q.discipline + "|" + t.materia + " › " + t.assunto];
        return { id, peso: (f ? f.prioridade : 0.5) + rand() * 0.6 };
      }).sort((x, y) => y.peso - x.peso).map((x) => x.id);
      porArea[area] = [...erradas, ...resto].slice(0, POR_AREA_SEMANA);
    }
    // revezamento: Linguagens, Humanas, Matemática, Natureza, Linguagens, ...
    const ids = [];
    for (let i = 0; i < POR_AREA_SEMANA; i++) for (const area of AREA_ORDEM) if (porArea[area][i]) ids.push(porArea[area][i]);
    return { id: tipo + "-" + Date.now(), tipo, semana: semanaISO(), ids, respostas: {}, pagina: 0, inicio: Date.now(), fim: null, resultado: null };
  }

  function fraquezaPorAssunto(s, mapa) {
    const todas = todasQuestoes();
    const freq = {}, totArea = {};
    const chaveT = (q, t) => q.discipline + "|" + t.materia + " › " + t.assunto;
    todas.forEach((q) => { const t = topicoDe(q); const k = chaveT(q, t); freq[k] = freq[k] || { n: 0, area: q.discipline, materia: t.materia, assunto: t.assunto }; freq[k].n++; totArea[q.discipline] = (totArea[q.discipline] || 0) + 1; });
    const out = {};
    for (const [k, f] of Object.entries(freq)) out[k] = Object.assign({}, f, { peso: f.n / (totArea[f.area] || 1), acertos: 0, erros: 0, noBanco: 0 });
    for (const [id, st] of Object.entries(s.stats)) {
      const q = mapa.get(id); if (!q) continue;
      const t = topicoDe(q); const o = out[chaveT(q, t)]; if (!o) continue;
      o.acertos += st.acertos || 0; o.erros += st.erros || 0;
    }
    s.banco.forEach((id) => { const q = mapa.get(id); if (!q) return; const t = topicoDe(q); const o = out[chaveT(q, t)]; o && o.noBanco++; });
    for (const o of Object.values(out)) {
      const tent = o.acertos + o.erros;
      o.taxa = tent ? o.acertos / tent : null;
      // prioridade: o quanto o assunto cai no ENEM × o quanto você ainda erra (não estudado conta como 50%)
      o.prioridade = o.peso * 4 * (1 - (o.taxa == null ? 0.5 : o.taxa));
    }
    return out;
  }

  function renderSemanal(view) {
    if (!todasQuestoes().length) { view.innerHTML = semProvas(); bindSemProvas(view); return; }
    let s = garantirBanco(estado());
    const ativa = s.sessoes.find((x) => !x.fim);
    if (ativa) return renderExameSemanal(view, s, ativa);
    const semana = semanaISO();
    const daSemana = s.sessoes.find((x) => x.tipo === "semanal" && x.semana === semana);
    const mapa = mapaPorId();
    const total = s.banco.length + s.eliminadas.length;
    const fraq = Object.values(fraquezaPorAssunto(s, mapa));
    const prioridades = fraq.filter((o) => o.noBanco > 0 && o.assunto !== OUTROS).sort((a, b) => b.prioridade - a.prioridade).slice(0, 12);
    const fortes = fraq.filter((o) => o.taxa != null && o.acertos + o.erros >= 3 && o.taxa >= 0.8).sort((a, b) => b.taxa - a.taxa).slice(0, 6);
    const hist = s.sessoes.filter((x) => x.fim).slice(-10);
    const areaStat = AREA_ORDEM.map((area) => {
      const ids = [...s.banco, ...s.eliminadas].filter((id) => mapa.has(id) && mapa.get(id).discipline === area);
      const elim = s.eliminadas.filter((id) => mapa.has(id) && mapa.get(id).discipline === area).length;
      let ac = 0, er = 0; ids.forEach((id) => { const st = s.stats[id] || {}; ac += st.acertos || 0; er += st.erros || 0; });
      return { area, total: ids.length, elim, taxa: ac + er ? ac / (ac + er) : null };
    });
    view.innerHTML = `
      <div class="card hero">
        <h1>Progresso semanal</h1>
        <p>Banco pessoal de ${total} questões (2016–2023). Toda semana você faz um exame de ${POR_AREA_SEMANA * 4} questões, ${POR_AREA_SEMANA} de cada área, em revezamento. Questão acertada sai do banco; questão errada volta para ele.</p>
        <div class="row" style="margin-top:12px">
          ${daSemana ? `<span class="pill ok">Exame da semana ${semana} concluído</span><button class="btn gold" id="novoExtra">Fazer treino extra (${POR_AREA_SEMANA * 4} questões)</button>`
                     : `<button class="btn gold" id="novoSemanal">Começar exame da semana (${POR_AREA_SEMANA * 4} questões)</button>`}
        </div>
      </div>
      <div class="card">
        <h2>Banco de questões</h2>
        <div class="row" style="align-items:flex-end;gap:18px"><div class="score-total">${s.eliminadas.length}</div><div class="muted">eliminadas de ${total} · faltam ${s.banco.length}</div></div>
        <div class="progress" style="margin:12px 0 18px"><i style="width:${pct(s.eliminadas.length, total)}%"></i></div>
        <div class="area-results">${areaStat.map((a) => `<div class="area-res" style="--c:${D.AREAS[a.area].cor}">
          <div class="small muted">${D.AREAS[a.area].nome}</div>
          <div class="big">${a.elim}<span class="muted" style="font-size:1rem"> / ${a.total}</span></div>
          <div class="progress"><i style="width:${pct(a.elim, a.total)}%;background:${D.AREAS[a.area].cor}"></i></div>
          <div class="small muted" style="margin-top:6px">${a.taxa == null ? "ainda sem respostas" : `acerto de ${Math.round(a.taxa * 100)}% nos exames`}</div></div>`).join("")}</div>
      </div>
      <div class="card">
        <h2>O que falta estudar</h2>
        <p class="small muted">Ordem de prioridade = quanto o assunto cai no ENEM × quanto você ainda erra. Assuntos que você ainda não respondeu contam como 50% de acerto.</p>
        <div class="tbl-wrap"><table class="table"><thead><tr><th>#</th><th>Assunto</th><th>Área</th><th>Peso no ENEM</th><th>Seu acerto</th><th>No banco</th></tr></thead>
        <tbody>${prioridades.map((o, i) => `<tr><td class="num">${i + 1}</td><td><b>${A().esc(o.assunto)}</b><div class="small muted">${A().esc(o.materia)}</div></td>
          <td><span class="pill" style="color:${D.AREAS[o.area].cor}">${D.AREAS[o.area].curto}</span></td>
          <td class="num">${Math.round(o.peso * 100)}% da área</td>
          <td class="num">${o.taxa == null ? "—" : Math.round(o.taxa * 100) + "% (" + (o.acertos + o.erros) + ")"}</td><td class="num">${o.noBanco}</td></tr>`).join("")}</tbody></table></div>
        ${fortes.length ? `<h3 style="margin-top:18px">Seus pontos fortes</h3><p>${fortes.map((o) => `<span class="pill ok">${A().esc(o.assunto)} · ${Math.round(o.taxa * 100)}%</span>`).join(" ")}</p>` : ""}
        <div class="row" style="margin-top:16px"><button class="btn gold" id="planoIA">${s.plano ? "Atualizar plano de estudo com IA" : "Gerar plano de estudo com IA"}</button></div>
        <div id="planoBox">${s.plano ? `<div class="ai-box md">${A().md(s.plano.texto)}</div><p class="small muted">Plano gerado em ${new Date(s.plano.em).toLocaleString("pt-BR")}.</p>` : ""}</div>
      </div>
      <div class="card">
        <h2>Histórico</h2>
        ${hist.length ? `<div class="tbl-wrap"><table class="table"><thead><tr><th>Semana</th><th>Tipo</th>${AREA_ORDEM.map((a) => `<th>${D.AREAS[a].curto}</th>`).join("")}<th>Total</th><th></th></tr></thead><tbody>
          ${hist.slice().reverse().map((h) => `<tr><td>${h.semana}</td><td>${h.tipo === "semanal" ? "Exame da semana" : "Treino extra"}</td>
            ${AREA_ORDEM.map((a) => `<td class="num">${(h.resultado.areas[a] || {}).acertos || 0}/${(h.resultado.areas[a] || {}).total || 0}</td>`).join("")}
            <td class="num"><b>${h.resultado.acertos}/${h.resultado.total}</b></td><td><button class="btn small" data-rev="${h.id}">Revisar</button></td></tr>`).join("")}</tbody></table></div>`
        : '<p class="muted">Nenhum exame semanal feito ainda.</p>'}
      </div>`;
    const iniciar = (tipo) => { const st = estado(); const ex = montarExame(garantirBanco(st), tipo); st.sessoes.push(ex); salvar(st); renderSemanal(view); };
    $("#novoSemanal", view) && ($("#novoSemanal", view).onclick = () => iniciar("semanal"));
    $("#novoExtra", view) && ($("#novoExtra", view).onclick = () => iniciar("extra"));
    $$("[data-rev]", view).forEach((b) => (b.onclick = () => revisarSessao(estado().sessoes.find((x) => x.id === b.dataset.rev))));
    $("#planoIA", view).onclick = async () => {
      const b = $("#planoIA", view); b.disabled = true; b.innerHTML = '<span class="spinner"></span> Escrevendo plano…';
      try {
        const texto = await window.EnemAI.planoDeEstudo({
          bancoRestante: s.banco.length, eliminadas: s.eliminadas.length,
          areas: areaStat.map((a) => ({ area: D.AREAS[a.area].nome, eliminadas: a.elim, total: a.total, acerto: a.taxa == null ? null : Math.round(a.taxa * 100) })),
          prioridades: prioridades.map((o) => ({ assunto: o.assunto, materia: o.materia, area: D.AREAS[o.area].curto, pesoNoEnem: Math.round(o.peso * 100), acerto: o.taxa == null ? null : Math.round(o.taxa * 100) })),
          fortes: fortes.map((o) => o.assunto)
        });
        const st = estado(); st.plano = { texto, em: new Date().toISOString() }; salvar(st);
        renderSemanal(view);
      } catch (e) { $("#planoBox", view).innerHTML = `<div class="ai-box">${A().esc(e.message)}</div>`; b.disabled = false; b.textContent = "Tentar de novo"; }
    };
  }

  let timerSem = null;
  function renderExameSemanal(view, s, ex) {
    const mapa = mapaPorId();
    const qs = ex.ids.map((id) => mapa.get(id)).filter(Boolean);
    if (ex.pagina >= qs.length) ex.pagina = 0;
    view.innerHTML = `
      <div class="exam-head">
        <span class="pill">${ex.tipo === "semanal" ? "Exame da semana " + ex.semana : "Treino extra"}</span>
        <span class="timer" id="semTimer">0:00:00</span>
        <div class="progress"><i id="semBar"></i></div><span class="small" id="semTxt"></span>
        <button class="btn small" id="semGrid">Questões</button>
        <button class="btn primary small" id="semFim">Finalizar</button>
      </div>
      <div class="book"><article class="page" id="semPage"></article></div>
      <div class="pager"><button class="btn" id="semPrev">← Anterior</button><span class="small muted" id="semPg"></span><button class="btn primary" id="semNext">Próxima →</button></div>`;
    const persist = () => { const st = estado(); const i = st.sessoes.findIndex((x) => x.id === ex.id); st.sessoes[i] = ex; salvar(st); };
    clearInterval(timerSem);
    const tick = () => { const t = $("#semTimer"); if (!t) return clearInterval(timerSem); t.textContent = A().fmtTime((Date.now() - ex.inicio) / 1000); };
    tick(); timerSem = setInterval(tick, 1000);
    const head = () => { const n = qs.filter((q) => ex.respostas[qid(q)]).length; $("#semBar").style.width = pct(n, qs.length) + "%"; $("#semTxt").textContent = `${n}/${qs.length}`; };
    function draw() {
      const q = qs[ex.pagina], k = qid(q), area = D.AREAS[q.discipline], t = topicoDe(q);
      $("#semPg").textContent = `Questão ${ex.pagina + 1} de ${qs.length}`;
      $("#semPrev").disabled = ex.pagina === 0;
      $("#semNext").textContent = ex.pagina === qs.length - 1 ? "Finalizar" : "Próxima →";
      const el = $("#semPage"); el.style.setProperty("--page-color", area.cor);
      el.innerHTML = `<div class="q-meta"><span class="q-num">${ex.pagina + 1}.</span>
          <span class="pill" style="color:${area.cor};background:color-mix(in srgb, ${area.cor} 12%, transparent)">${area.curto}</span>
          <span class="pill">ENEM ${q.year} · questão ${q.index}</span><span class="pill">${A().esc(t.assunto)}</span>
          ${(s.stats[k] || {}).erros ? '<span class="pill warn">você já errou esta</span>' : ""}</div>
        ${A().questionBody(q)}
        <div class="alts">${q.alternatives.map((a) => `<button class="alt ${ex.respostas[k] === a.letter ? "selected" : ""}" data-l="${a.letter}"><span class="letter">${a.letter}</span><span class="alt-body">${a.text ? A().md(a.text) : ""}${a.file ? `<img data-src="${A().esc(a.file)}" alt="Alternativa ${a.letter}">` : ""}${!a.text && !a.file ? `Alternativa ${a.letter}` : ""}</span></button>`).join("")}</div>`;
      A().hydrateImages(el);
      $$(".alt", el).forEach((b) => (b.onclick = () => { const L = b.dataset.l; if (ex.respostas[k] === L) delete ex.respostas[k]; else ex.respostas[k] = L; persist(); head(); draw(); }));
    }
    let busy = false;
    const goTo = (i) => {
      if (busy || i < 0 || i >= qs.length || i === ex.pagina) return;
      const dir = i > ex.pagina ? "next" : "prev", el = $("#semPage"); busy = true;
      el.classList.add("turn-out-" + dir);
      setTimeout(() => { el.classList.remove("turn-out-" + dir); ex.pagina = i; persist(); draw(); el.classList.add("turn-in-" + dir); window.scrollTo({ top: 0, behavior: "smooth" }); setTimeout(() => { el.classList.remove("turn-in-" + dir); busy = false; }, 430); }, 360);
    };
    const finalizar = () => {
      const st = estado();
      const res = { areas: {}, acertos: 0, total: qs.length };
      for (const q of qs) {
        const k = qid(q), ok = ex.respostas[k] === q.correctAlternative;
        const a = res.areas[q.discipline] || (res.areas[q.discipline] = { acertos: 0, total: 0 });
        a.total++; if (ok) { a.acertos++; res.acertos++; }
        const stq = st.stats[k] || (st.stats[k] = { area: q.discipline, acertos: 0, erros: 0 });
        if (ok) { stq.acertos++; st.banco = st.banco.filter((x) => x !== k); if (!st.eliminadas.includes(k)) st.eliminadas.push(k); }
        else { stq.erros++; if (!st.banco.includes(k)) st.banco.push(k); st.eliminadas = st.eliminadas.filter((x) => x !== k); }
      }
      ex.fim = Date.now(); ex.resultado = res;
      const i = st.sessoes.findIndex((x) => x.id === ex.id); st.sessoes[i] = ex; salvar(st);
      clearInterval(timerSem);
      A().modal(`<h2>Resultado: ${res.acertos} de ${res.total}</h2>
        <div class="area-results">${AREA_ORDEM.map((a) => res.areas[a] ? `<div class="area-res" style="--c:${D.AREAS[a].cor}"><div class="small muted">${D.AREAS[a].nome}</div><div class="big">${res.areas[a].acertos}/${res.areas[a].total}</div></div>` : "").join("")}</div>
        <p class="muted" style="margin-top:12px">${res.acertos} ${res.acertos === 1 ? "questão saiu" : "questões saíram"} do seu banco. As ${res.total - res.acertos} erradas ou em branco continuam nele e voltam com prioridade nos próximos exames.</p>
        <div class="row"><button class="btn primary" id="semVerRel">Ver relatório</button><button class="btn" id="semRev">Revisar questões</button></div>`);
      $("#semVerRel").onclick = () => { A().closeModal(); renderSemanal(view); };
      $("#semRev").onclick = () => { A().closeModal(); renderSemanal(view); revisarSessao(ex); };
    };
    $("#semPrev").onclick = () => goTo(ex.pagina - 1);
    $("#semNext").onclick = () => ex.pagina === qs.length - 1 ? $("#semFim").click() : goTo(ex.pagina + 1);
    $("#semGrid").onclick = () => {
      A().modal(`<h2>Questões do exame</h2><div class="qgrid">${qs.map((q, i) => `<button data-i="${i}" class="${ex.respostas[qid(q)] ? "answered" : ""} ${i === ex.pagina ? "current" : ""}" title="${D.AREAS[q.discipline].curto}">${i + 1}</button>`).join("")}</div>`);
      $$("#modalBody [data-i]").forEach((b) => (b.onclick = () => { A().closeModal(); goTo(Number(b.dataset.i)); }));
    };
    $("#semFim").onclick = () => {
      const brancos = qs.filter((q) => !ex.respostas[qid(q)]).length;
      A().modal(`<h2>Finalizar o exame?</h2><p>${brancos ? `Você deixou <b>${brancos}</b> em branco (contam como erro e continuam no banco).` : "Todas respondidas."}</p>
        <div class="row"><button class="btn" id="semCont">Continuar</button><button class="btn primary" id="semOk">Finalizar e corrigir</button></div>`);
      $("#semCont").onclick = A().closeModal;
      $("#semOk").onclick = () => { A().closeModal(); finalizar(); };
    };
    document.onkeydown = (e) => {
      if (!$("#semPage") || !$("#modal").hidden || /textarea|input|select/i.test(document.activeElement.tagName)) return;
      if (e.key === "ArrowRight") goTo(ex.pagina + 1);
      else if (e.key === "ArrowLeft") goTo(ex.pagina - 1);
      else if (/^[a-e]$/i.test(e.key)) { const b = $(`#semPage .alt[data-l="${e.key.toUpperCase()}"]`); b && b.click(); }
    };
    // deslizar o dedo no celular
    let tx = null; const book = $(".book", view);
    book.addEventListener("touchstart", (e) => (tx = e.touches[0].clientX), { passive: true });
    book.addEventListener("touchend", (e) => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 70) goTo(ex.pagina + (dx < 0 ? 1 : -1)); });
    head(); draw();
  }

  function revisarSessao(ex) {
    if (!ex) return;
    const mapa = mapaPorId();
    const qs = ex.ids.map((id) => mapa.get(id)).filter(Boolean);
    let i = 0;
    const show = () => {
      const q = qs[i], k = qid(q), mine = ex.respostas[k], area = D.AREAS[q.discipline];
      A().modal(`<div class="q-meta"><span class="q-num">${i + 1}.</span><span class="pill">${area.curto}</span><span class="pill">ENEM ${q.year} · questão ${q.index}</span>
          ${!mine ? '<span class="pill warn">em branco</span>' : mine === q.correctAlternative ? '<span class="pill ok">acertou</span>' : `<span class="pill bad">marcou ${mine}</span>`}
          <span class="pill ok">gabarito ${q.correctAlternative}</span></div>
        ${A().questionBody(q)}
        <div class="alts">${q.alternatives.map((a) => `<div class="alt ${a.letter === q.correctAlternative ? "correct" : a.letter === mine ? "wrong" : ""}"><span class="letter">${a.letter}</span><span class="alt-body">${a.text ? A().md(a.text) : ""}${a.file ? `<img data-src="${A().esc(a.file)}" alt="">` : ""}${!a.text && !a.file ? `Alternativa ${a.letter}` : ""}</span></div>`).join("")}</div>
        <div class="pager"><button class="btn" id="rvPrev" ${i === 0 ? "disabled" : ""}>← Anterior</button><span class="small muted">${i + 1} de ${qs.length}</span><button class="btn primary" id="rvNext" ${i === qs.length - 1 ? "disabled" : ""}>Próxima →</button></div>`);
      A().hydrateImages($("#modalBody"));
      $("#rvPrev").onclick = () => { i--; show(); };
      $("#rvNext").onclick = () => { i++; show(); };
    };
    show();
  }

  function semProvas() {
    return `<div class="card"><h2>Baixe as provas primeiro</h2><p class="muted">O banco de questões e o mapa de matérias usam as provas de 2016 a 2023. Na aba Início, clique em "Baixar / completar todas as provas" (precisa de internet uma vez).</p><button class="btn primary" id="irInicio">Ir para o Início</button></div>`;
  }
  function bindSemProvas(view) { const b = $("#irInicio", view); b && (b.onclick = () => A().go("inicio")); }

  window.SimEstudo = { renderMaterias, renderSemanal, topicoDe, semanaISO, stopTimers: () => clearInterval(timerSem) };
})();
