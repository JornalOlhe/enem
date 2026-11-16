/* Busca as questões na API pública enem.dev (no navegador do usuário) e guarda tudo em IndexedDB para uso offline. */
(function () {
  const API = "https://api.enem.dev/v1";
  const REPO_RAW = "https://raw.githubusercontent.com/yunger7/enem-api/main/public";
  const DB_NAME = "simulado-enem";
  let dbPromise = null;

  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("exams")) d.createObjectStore("exams");
        if (!d.objectStoreNames.contains("images")) d.createObjectStore("images");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function idb(store, mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(store, mode);
      const s = tx.objectStore(store);
      const r = fn(s);
      tx.oncomplete = () => resolve(r && "result" in r ? r.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  }
  const getExam = (year) => idb("exams", "readonly", (s) => s.get(String(year)));
  const putExam = (year, data) => idb("exams", "readwrite", (s) => s.put(data, String(year)));
  const delExam = (year) => idb("exams", "readwrite", (s) => s.delete(String(year)));
  const getImage = (url) => idb("images", "readonly", (s) => s.get(url));
  const putImage = (url, blob) => idb("images", "readwrite", (s) => s.put(blob, url));
  const hasImage = (url) => idb("images", "readonly", (s) => s.count(url)).then((n) => n > 0);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let lastCall = 0;
  // A API permite cerca de 1 requisição por segundo.
  async function apiGet(path, tries = 0) {
    const wait = Math.max(0, lastCall + 1150 - Date.now());
    if (wait) await sleep(wait);
    lastCall = Date.now();
    const res = await fetch(API + path, { headers: { Accept: "application/json" } });
    if (res.status === 429 && tries < 6) {
      const ra = parseInt(res.headers.get("Retry-After") || "3", 10);
      await sleep((isNaN(ra) ? 3 : ra) * 1000 + 300);
      return apiGet(path, tries + 1);
    }
    if (!res.ok) {
      let msg = "HTTP " + res.status;
      try { const j = await res.json(); if (j && j.error) msg += " – " + j.error.message; } catch (e) {}
      const err = new Error(msg); err.status = res.status; throw err;
    }
    return res.json();
  }

  // Identifica a língua de um texto estrangeiro (a API às vezes não marca a língua da questão).
  function detectLang(text) {
    const t = " " + String(text || "").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").toLowerCase() + " ";
    const en = (t.match(/\b(the|and|of|to|is|are|you|that|with|for|this|it|was|be|have)\b/g) || []).length;
    const es = (t.match(/\b(el|los|las|y|del|una|por|es|con|pero|muy|más|su|lo|se|como)\b/g) || []).length;
    if (en >= 3 && en > es * 1.5) return "ingles";
    if (es >= 3 && es > en * 1.5) return "espanhol";
    return null;
  }
  const sig = (q) => (q.title || "") + "#" + String(q.context || "").slice(0, 200);

  async function fetchAllQuestions(year, onProgress) {
    const out = new Map();
    const untagged = []; // versões sem língua (podem ser Inglês/Espanhol mal marcados)
    const add = (q) => {
      if (!q.language) untagged.push(q);
      const k = q.index + "|" + (q.language || "");
      if (!out.has(k) || q.language) out.set(k, q);
    };
    let limit = 50, offset = 0, total = null, guard = 0;
    while (guard++ < 40) {
      let r;
      try {
        r = await apiGet(`/exams/${year}/questions?limit=${limit}&offset=${offset}`);
      } catch (e) {
        if ((e.status === 400 || e.status === 422) && limit > 10) { limit = 10; continue; }
        throw e;
      }
      (r.questions || []).forEach(add);
      total = r.metadata ? r.metadata.total : null;
      offset += (r.questions || []).length;
      onProgress && onProgress({ fase: "questoes", feito: offset, total: total || offset });
      if (!r.metadata || !r.metadata.hasMore || !(r.questions || []).length) break;
    }
    // Garante as duas línguas estrangeiras. A posição delas muda conforme o ano
    // (em 2016 ficam nas questões 91 a 95), então percorremos a prova inteira com o filtro de língua.
    for (const lang of ["ingles", "espanhol"]) {
      let off = 0, g = 0;
      while (g++ < 10) {
        let r;
        try { r = await apiGet(`/exams/${year}/questions?limit=${limit}&offset=${off}&language=${lang}`); } catch (e) { break; }
        const qs = r.questions || [];
        const found = qs.filter((q) => q.language === lang);
        found.forEach(add);
        // versões sem marcação de língua perto do bloco de língua estrangeira
        if (found.length) {
          const lo = Math.min(...found.map((q) => q.index));
          qs.filter((q) => !q.language && q.index >= lo && q.index < lo + 5).forEach((q) => untagged.push(q));
        }
        off += qs.length;
        if (found.length || !r.metadata || !r.metadata.hasMore || !qs.length) break;
      }
    }
    // Recupera questões de língua estrangeira que vieram sem marcação: classifica pelo texto.
    const tagged = [...out.values()].filter((q) => q.language);
    if (tagged.length) {
      const lo = Math.min(...tagged.map((q) => q.index));
      for (let idx = lo; idx < lo + 5; idx++) {
        const versions = new Map();
        untagged.filter((q) => q.index === idx).forEach((q) => versions.set(sig(q), q));
        if (out.has(idx + "|ingles") && out.has(idx + "|espanhol")) continue;
        const list = [...versions.values()];
        // 1) tenta pelo texto
        for (const q of list) {
          const lang = detectLang(q.context);
          if (lang && !out.has(idx + "|" + lang)) out.set(idx + "|" + lang, Object.assign({}, q, { language: lang }));
        }
        // 2) se ainda faltar, consulta o repositório público da enem.dev, que guarda a língua no nome da pasta
        if (!(out.has(idx + "|ingles") && out.has(idx + "|espanhol"))) {
          for (const lang of ["ingles", "espanhol"]) {
            if (out.has(idx + "|" + lang)) continue;
            try {
              const res = await fetch(`${REPO_RAW}/${year}/questions/${idx}-${lang}/details.json`);
              if (!res.ok) continue;
              const d = await res.json();
              const match = list.find((q) => sig(q) === sig(d)) || d;
              out.set(idx + "|" + lang, Object.assign({}, match, { language: lang }));
              const other = lang === "ingles" ? "espanhol" : "ingles";
              const rest = list.find((q) => q !== match && sig(q) !== sig(d));
              if (rest && !out.has(idx + "|" + other)) out.set(idx + "|" + other, Object.assign({}, rest, { language: other }));
            } catch (e) { /* segue com a versão comum */ }
          }
        }
        if (out.has(idx + "|ingles") && out.has(idx + "|espanhol")) out.delete(idx + "|");
      }
    }
    return [...out.values()].sort((a, b) => a.index - b.index || String(a.language).localeCompare(String(b.language)));
  }

  function imageUrlsOf(q) {
    const urls = new Set();
    const re = /!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;
    let m;
    [q.context, q.alternativesIntroduction].forEach((t) => { if (t) while ((m = re.exec(t))) urls.add(m[1]); });
    (q.files || []).forEach((u) => u && urls.add(u));
    (q.alternatives || []).forEach((a) => a.file && urls.add(a.file));
    return [...urls];
  }

  async function cacheImages(questions, onProgress) {
    const urls = [...new Set(questions.flatMap(imageUrlsOf))];
    let feito = 0, falhas = 0;
    const queue = urls.slice();
    async function worker() {
      while (queue.length) {
        const u = queue.shift();
        try {
          if (!(await hasImage(u))) {
            const res = await fetch(u, { mode: "cors" });
            if (!res.ok) throw new Error(res.status);
            await putImage(u, await res.blob());
          }
        } catch (e) { falhas++; }
        feito++;
        onProgress && onProgress({ fase: "imagens", feito, total: urls.length, falhas });
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    return { total: urls.length, falhas };
  }

  async function downloadYear(year, onProgress) {
    const questions = await fetchAllQuestions(year, onProgress);
    if (!questions.length) throw new Error("A API não retornou questões para " + year);
    const data = { year, source: "api.enem.dev", savedAt: new Date().toISOString(), questions };
    await putExam(year, data);
    const img = await cacheImages(questions, onProgress);
    data.images = img;
    await putExam(year, data);
    return data;
  }

  // Importação manual (para 2024/2025 ou qualquer ano): aceita o formato da enem.dev
  // { questions:[...] } ou uma lista de questões, ou um pacote exportado por este simulador.
  async function importJSON(obj, forcedYear) {
    const results = [];
    if (obj && obj.pacote === "simulado-enem" && Array.isArray(obj.exams)) {
      for (const e of obj.exams) { await putExam(e.year, e); results.push(e.year); }
      return results;
    }
    const qs = Array.isArray(obj) ? obj : obj && obj.questions;
    if (!Array.isArray(qs) || !qs.length) throw new Error("Arquivo sem lista de questões.");
    const year = forcedYear || qs[0].year || (obj && obj.year);
    if (!year) throw new Error("Não foi possível identificar o ano da prova.");
    await putExam(year, { year: Number(year), source: "importado", savedAt: new Date().toISOString(), questions: qs });
    results.push(Number(year));
    return results;
  }

  async function exportAll(years) {
    const exams = [];
    for (const y of years) { const e = await getExam(y); if (e) exams.push(e); }
    return { pacote: "simulado-enem", versao: 1, exportadoEm: new Date().toISOString(), exams };
  }

  const objectUrls = new Map();
  async function resolveImage(url) {
    if (objectUrls.has(url)) return objectUrls.get(url);
    try {
      const blob = await getImage(url);
      if (blob) { const o = URL.createObjectURL(blob); objectUrls.set(url, o); return o; }
    } catch (e) {}
    return url; // sem cache: usa a imagem online
  }

  window.EnemAPI = { getExam, putExam, delExam, downloadYear, importJSON, exportAll, resolveImage, imageUrlsOf, cacheImages };
})();
