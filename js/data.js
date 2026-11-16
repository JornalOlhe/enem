/* Dados fixos do simulador: edições, temas de redação, áreas, tópicos e competências. */
window.ENEM_DATA = {
  YEARS: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023],
  API_COVERAGE_MAX: 2023,
  EXAM_SECONDS: 6 * 60 * 60, // 6 horas por dia de prova

  THEMES: {
    2016: "Caminhos para combater a intolerância religiosa no Brasil",
    2017: "Desafios para a formação educacional de surdos no Brasil",
    2018: "Manipulação do comportamento do usuário pelo controle de dados na internet",
    2019: "Democratização do acesso ao cinema no Brasil",
    2020: "O estigma associado às doenças mentais na sociedade brasileira",
    2021: "Invisibilidade e registro civil: garantia de acesso à cidadania no Brasil",
    2022: "Desafios para a valorização de comunidades e povos tradicionais no Brasil",
    2023: "Desafios para o enfrentamento da invisibilidade do trabalho de cuidado realizado pela mulher no Brasil"
  },

  AREAS: {
    "linguagens":        { nome: "Linguagens, Códigos e suas Tecnologias", curto: "Linguagens", cor: "#7b4fb3", dia: 1 },
    "ciencias-humanas":  { nome: "Ciências Humanas e suas Tecnologias",     curto: "Ciências Humanas", cor: "#b0603a", dia: 1 },
    "ciencias-natureza": { nome: "Ciências da Natureza e suas Tecnologias", curto: "Ciências da Natureza", cor: "#2f7d5b", dia: 2 },
    "matematica":        { nome: "Matemática e suas Tecnologias",           curto: "Matemática", cor: "#2c5aa0", dia: 2 }
  },

  DAYS: {
    1: { titulo: "Dia 1", sub: "Linguagens · Ciências Humanas · Redação", areas: ["linguagens", "ciencias-humanas"], redacao: true },
    2: { titulo: "Dia 2", sub: "Ciências da Natureza · Matemática", areas: ["ciencias-natureza", "matematica"], redacao: false }
  },

  TOPICS: {
    "interpretacao": {
      titulo: "Interpretação de texto (todas as áreas)",
      itens: [
        "Ler o comando da questão antes do texto-base e identificar o que exatamente se pede",
        "Distinguir informação explícita, inferência e extrapolação indevida",
        "Reconhecer a tese, os argumentos e a finalidade comunicativa do texto",
        "Relacionar texto verbal e não verbal: gráficos, tabelas, charges, mapas e infográficos",
        "Eliminar alternativas que generalizam, contradizem ou fogem do recorte do texto",
        "Gerenciar o tempo: cerca de 3 minutos por questão, reservando tempo para a redação"
      ]
    },
    "linguagens": {
      titulo: "Linguagens, Códigos e suas Tecnologias",
      itens: [
        "Gêneros textuais e funções da linguagem",
        "Variação linguística e preconceito linguístico",
        "Figuras de linguagem, coesão e coerência",
        "Literatura brasileira: escolas literárias, Modernismo e literatura contemporânea",
        "Intertextualidade, paródia e paráfrase",
        "Artes visuais, música, dança, teatro e patrimônio cultural",
        "Educação Física: cultura corporal, esporte, saúde e corpo",
        "Tecnologias da informação e comunicação",
        "Língua estrangeira (Inglês ou Espanhol): leitura e compreensão global"
      ]
    },
    "ciencias-humanas": {
      titulo: "Ciências Humanas e suas Tecnologias",
      itens: [
        "História do Brasil: Colônia, Império, República, Era Vargas, Ditadura e redemocratização",
        "História Geral: Antiguidade, Idade Média, Revoluções, Guerras Mundiais e Guerra Fria",
        "Geografia física: clima, relevo, hidrografia, biomas e questões ambientais",
        "Geografia humana: urbanização, população, agropecuária, indústria e globalização",
        "Cartografia, escalas e leitura de mapas",
        "Filosofia: pensamento antigo, moderno e contemporâneo; ética e política",
        "Sociologia: trabalho, cultura, cidadania, movimentos sociais e desigualdade",
        "Direitos humanos, povos indígenas, populações afro-brasileiras e diversidade"
      ]
    },
    "ciencias-natureza": {
      titulo: "Ciências da Natureza e suas Tecnologias",
      itens: [
        "Biologia: ecologia, genética, evolução, citologia, fisiologia humana, saúde e saneamento",
        "Química: estequiometria, soluções, química orgânica, eletroquímica, termoquímica, equilíbrio e química ambiental",
        "Física: mecânica, energia e suas transformações, eletricidade, ondulatória, óptica e termologia",
        "Interpretação de experimentos, gráficos e dados científicos",
        "Ciência, tecnologia e sociedade: impactos ambientais e energéticos"
      ]
    },
    "matematica": {
      titulo: "Matemática e suas Tecnologias",
      itens: [
        "Razão, proporção, regra de três e porcentagem",
        "Estatística: média, mediana, moda, desvio e leitura de gráficos",
        "Probabilidade e análise combinatória",
        "Funções afim, quadrática, exponencial e logarítmica",
        "Geometria plana e espacial: áreas, volumes e semelhança",
        "Escalas, unidades de medida e conversões",
        "Trigonometria, progressões e matemática financeira"
      ]
    },
    "redacao": {
      titulo: "Redação (texto dissertativo-argumentativo)",
      itens: [
        "Estrutura: introdução com tese, dois parágrafos de desenvolvimento e conclusão com proposta",
        "Repertório sociocultural legitimado, pertinente e produtivo",
        "Proposta de intervenção completa: agente, ação, meio/modo, finalidade e detalhamento",
        "Coesão: conectivos variados entre e dentro dos parágrafos",
        "Limite de 30 linhas; textos com até 7 linhas recebem nota zero"
      ]
    }
  },

  /* Questões que não existem na base pública (api.enem.dev). O enunciado é aberto na fonte de
     correção indicada; aqui ficam só o número, a área e o gabarito oficial (caderno azul). */
  FALTANTES: [
    { ano: 2016, n: 93,  area: "linguagens",        lingua: "ingles", gab: "D", fonte: "Plataforma Assaad", url: "https://plataformaassaad.com.br/questao-93-caderno-azul-do-enem-2016/" },
    { ano: 2018, n: 62,  area: "ciencias-humanas",  lingua: null,     gab: "B", fonte: "Plataforma Assaad", url: "https://plataformaassaad.com.br/questao-62-caderno-azul-do-enem-2018/" },
    { ano: 2019, n: 5,   area: "linguagens",        lingua: "ingles", gab: "E", fonte: "Descomplica",       url: "https://descomplica.com.br/gabarito-enem/questoes/2019/primeiro-dia/no-cartum-o-estudante-faz-uma-pergunta-usando-turn-thing-por/" },
    { ano: 2019, n: 98,  area: "ciencias-natureza", lingua: null,     gab: "E", fonte: "Plataforma Assaad", url: "https://plataformaassaad.com.br/questao-98-caderno-azul-do-enem-2019/" },
    { ano: 2019, n: 100, area: "ciencias-natureza", lingua: null,     gab: "D", fonte: "Plataforma Assaad", url: "https://plataformaassaad.com.br/questao-100-caderno-azul-do-enem-2019/" },
    { ano: 2019, n: 128, area: "ciencias-natureza", lingua: null,     gab: "E", fonte: "Plataforma Assaad", url: "https://plataformaassaad.com.br/questao-128-caderno-azul-do-enem-2019/" },
    { ano: 2020, n: 144, area: "matematica",        lingua: null,     gab: "B", fonte: "Descomplica",       url: "https://descomplica.com.br/gabarito-enem/questoes/2020/segundo-dia/quanto-tempo-em-hora-sera-necessario-para-encher-completamente-o-balde-partindo-do-instante-atual/" },
    { ano: 2020, n: 168, area: "matematica",        lingua: null,     gab: "A", fonte: "Plataforma Assaad", url: "https://plataformaassaad.com.br/questao-168-caderno-azul-do-enem-2020/" },
    { ano: 2020, n: 179, area: "matematica",        lingua: null,     gab: "E", fonte: "Plataforma Assaad", url: "https://plataformaassaad.com.br/questao-179-caderno-azul-do-enem-2020/" },
    { ano: 2023, n: 34,  area: "linguagens",        lingua: null,     gab: "C", fonte: "Plataforma Assaad", url: "https://plataformaassaad.com.br/questao-34-caderno-azul-do-enem-2023/" },
    { ano: 2023, n: 174, area: "matematica",        lingua: null,     gab: "E", fonte: "Plataforma Assaad", url: "https://plataformaassaad.com.br/questao-174-caderno-azul-do-enem-2023/" }
  ],

  COMPETENCIAS: [
    { n: 1, nome: "Competência 1", desc: "Demonstrar domínio da modalidade escrita formal da língua portuguesa." },
    { n: 2, nome: "Competência 2", desc: "Compreender a proposta de redação e aplicar conceitos das várias áreas de conhecimento para desenvolver o tema, dentro dos limites estruturais do texto dissertativo-argumentativo em prosa." },
    { n: 3, nome: "Competência 3", desc: "Selecionar, relacionar, organizar e interpretar informações, fatos, opiniões e argumentos em defesa de um ponto de vista." },
    { n: 4, nome: "Competência 4", desc: "Demonstrar conhecimento dos mecanismos linguísticos necessários para a construção da argumentação." },
    { n: 5, nome: "Competência 5", desc: "Elaborar proposta de intervenção para o problema abordado, respeitando os direitos humanos." }
  ]
};
