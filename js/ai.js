/* Integração com a IA (Google Gemini) para corrigir a redação pelas Competências 1 a 5 e explicar questões. */
(function () {
  const DEFAULT_KEY = "AQ.Ab8RN6LSV1dS__K_fVNxOEyHe-gLZBzOUG3-G33e93U4w58Utg";
  const DEFAULT_MODEL = "gemini-flash-latest"; // melhor modelo gratuito; se faltar cota, cai para os seguintes
  const FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-lite-latest", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"];

  async function call(prompt, { json = false } = {}) {
    const key = DEFAULT_KEY;
    const models = [DEFAULT_MODEL, ...FALLBACK_MODELS.filter((m) => m !== DEFAULT_MODEL)];
    const endpoints = [
      (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
      (m) => `https://aiplatform.googleapis.com/v1/publishers/google/models/${m}:generateContent`
    ];
    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: Object.assign({ temperature: 0.2 }, json ? { responseMimeType: "application/json" } : {})
    };
    const errors = [];
    for (const ep of endpoints) {
      for (const m of models) {
        try {
          const res = await fetch(ep(m) + "?key=" + encodeURIComponent(key), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            errors.push(`${m}: ${res.status} ${(data.error && data.error.message) || ""}`.trim());
            if (res.status === 401 || res.status === 403) break; // chave sem acesso a este endpoint
            continue; // 404 (modelo indisponível) ou 429 (sem cota): tenta o próximo modelo
          }
          const text = (data.candidates || [])
            .flatMap((c) => (c.content && c.content.parts) || [])
            .filter((p) => !p.thought).map((p) => p.text || "").join("");
          if (text) return text;
          errors.push(`${m}: resposta vazia`);
        } catch (e) {
          errors.push(`${m}: ${e.message}`);
        }
      }
    }
    throw new Error("Não foi possível falar com a IA.\n" + errors.slice(0, 4).join("\n"));
  }

  function parseJSON(text) {
    const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try { return JSON.parse(t); } catch (e) {}
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error("A IA respondeu em formato inesperado.");
  }

  const snap = (n) => Math.max(0, Math.min(200, Math.round((Number(n) || 0) / 40) * 40));

  async function corrigirRedacao({ tema, texto, ano }) {
    const C = window.ENEM_DATA.COMPETENCIAS;
    const linhas = texto.split(/\n/).filter((l) => l.trim()).length;
    const prompt = `Você é um corretor oficial da redação do Exame Nacional do Ensino Médio, treinado conforme a Cartilha do Participante publicada pelo Instituto Nacional de Estudos e Pesquisas Educacionais Anísio Teixeira.
Corrija, de maneira formal, rigorosa e imparcial, a redação abaixo, escrita para a edição de ${ano}.

Tema proposto: "${tema}"

Avalie cada uma das cinco competências, atribuindo a cada uma exatamente um destes valores: 0, 40, 80, 120, 160 ou 200.
${C.map((c) => `- ${c.nome}: ${c.desc}`).join("\n")}

Aplique os critérios de anulação (nota zero em todas as competências) quando houver: fuga total ao tema; texto que não seja dissertativo-argumentativo; texto com até sete linhas; parte deliberadamente desconectada do tema; identificação do participante; ou texto em branco. Considere também os critérios da Cartilha sobre desrespeito aos direitos humanos na avaliação da Competência 5.
O texto possui aproximadamente ${linhas} linhas não vazias (o limite oficial é de 30 linhas).

Avalie cada competência de forma INDEPENDENTE: é normal que as notas sejam diferentes entre si. Use estes níveis de referência:
- Competência 1 (norma escrita): 200 = no máximo dois desvios leves, sem reincidência; 160 = poucos desvios; 120 = desvios frequentes, mas com estrutura sintática regular; 80 = muitos desvios de concordância, regência, pontuação ou ortografia; 40 = domínio precário, com desvios diversos e frequentes; 0 = desconhecimento da norma.
- Competência 2 (tema e tipo textual): 200 = abordagem completa do tema, repertório legitimado, pertinente e produtivo, e excelente domínio do texto dissertativo-argumentativo; 160 = repertório pertinente, mas pouco produtivo; 120 = abordagem completa com argumentação previsível ou repertório apenas baseado nos textos motivadores ou no senso comum; 80 = cópia dos motivadores ou domínio insuficiente da estrutura; 40 = tangencia o tema; 0 = fuga ao tema ou outro tipo textual.
- Competência 3 (argumentação): 200 = projeto de texto estratégico, com argumentos desenvolvidos e consistentes; 160 = projeto claro, com poucas falhas de desenvolvimento; 120 = argumentos limitados, pouco desenvolvidos ou de senso comum; 80 = informações desorganizadas ou contraditórias; 40 = pouco relacionadas ao tema; 0 = sem defesa de ponto de vista.
- Competência 4 (coesão): 200 = repertório diversificado de recursos coesivos entre e dentro dos parágrafos, sem inadequações; 160 = poucas inadequações; 120 = repertório pouco diversificado (repetição de conectivos como "também", "então", "isso"); 80 = coesão insuficiente; 40 = precária; 0 = ausente.
- Competência 5 (proposta de intervenção): conte os elementos presentes: agente, ação, modo ou meio, finalidade e detalhamento. 200 = os cinco elementos, bem articulados à discussão; 160 = quatro elementos; 120 = três; 80 = dois; 40 = um ou proposta vaga ("o governo tem que fazer alguma coisa"); 0 = ausente ou desrespeito aos direitos humanos.
Antes de atribuir cada nota, liste os desvios e problemas concretos encontrados naquela competência e escolha o nível que melhor corresponde a eles. Na dúvida entre dois níveis, atribua o menor.

Regras de redação da sua resposta:
- Escreva sempre em português formal.
- Não use abreviações: escreva "Competência 1", "Competência 2" etc. por extenso, nunca "C1"; escreva "Exame Nacional do Ensino Médio" ou "Enem", nunca siglas sem explicação.
- Em cada competência, justifique a nota citando trechos curtos do próprio texto do participante e indique o nível de desempenho correspondente.

Responda SOMENTE com um objeto JSON válido, neste formato:
{
  "anulada": false,
  "motivoAnulacao": "",
  "competencias": [
    {"numero": 1, "desvios": ["problemas concretos encontrados nesta competência"], "nota": 0, "nivel": "descrição do nível de desempenho", "justificativa": "texto formal", "comoMelhorar": "orientações objetivas"}
  ],
  "parecerGeral": "parecer formal em um ou dois parágrafos",
  "pontosFortes": ["..."],
  "pontosAMelhorar": ["..."]
}

Redação do participante:
"""
${texto}
"""`;
    const r = parseJSON(await call(prompt, { json: true }));
    const comps = C.map((c) => {
      const f = (r.competencias || []).find((x) => Number(x.numero) === c.n) || {};
      return {
        numero: c.n, nome: c.nome, desc: c.desc,
        nota: r.anulada ? 0 : snap(f.nota),
        nivel: f.nivel || "", justificativa: f.justificativa || "", comoMelhorar: f.comoMelhorar || ""
      };
    });
    return {
      anulada: !!r.anulada, motivoAnulacao: r.motivoAnulacao || "",
      competencias: comps,
      total: comps.reduce((s, c) => s + c.nota, 0),
      parecerGeral: r.parecerGeral || "", pontosFortes: r.pontosFortes || [], pontosAMelhorar: r.pontosAMelhorar || [],
      corrigidaEm: new Date().toISOString()
    };
  }

  async function explicarQuestao({ q, marcada, area }) {
    const alts = (q.alternatives || []).map((a) => `${a.letter}) ${a.text || "[alternativa em imagem]"}`).join("\n");
    const prompt = `Você é um professor experiente de cursinho preparatório para o Exame Nacional do Ensino Médio. Explique, em português formal e didático, a resolução da questão ${q.index} da prova de ${q.year} (${area}).
${q.context ? "Texto-base:\n" + q.context.replace(/!\[[^\]]*\]\([^)]*\)/g, "[imagem]") : ""}
${q.alternativesIntroduction ? "\nComando: " + q.alternativesIntroduction : ""}
Alternativas:
${alts}

Gabarito oficial: ${q.correctAlternative}.
${marcada ? `O estudante marcou: ${marcada}.` : "O estudante deixou em branco."}

Estruture a resposta em: 1) o que a questão pede; 2) resolução passo a passo; 3) por que a alternativa ${q.correctAlternative} está correta; 4) ${marcada && marcada !== q.correctAlternative ? `por que a alternativa ${marcada} está incorreta;` : "armadilhas comuns;"} 5) conteúdo a revisar. Seja objetivo (no máximo 250 palavras). Se houver imagem que você não vê, diga o que ela provavelmente mostra com base no enunciado.`;
    return call(prompt);
  }

  window.EnemAI = { corrigirRedacao, explicarQuestao, DEFAULT_MODEL };
})();
