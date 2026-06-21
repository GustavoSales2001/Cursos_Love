const conversationState = new Map();

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getUserKey(user) {
  return String(user?.id || user?.celular || user?.email || "anonymous");
}

function getFirstName(user) {
  return user?.name ? user.name.split(" ")[0] : "";
}

function setStage(userKey, stage) {
  conversationState.set(userKey, {
    stage,
    updatedAt: Date.now()
  });
}

function getStage(userKey) {
  return conversationState.get(userKey)?.stage || "inicio";
}

function isOption(msg, number) {
  const optionWords = {
    1: ["1", "opcao 1", "primeira", "primeiro", "a primeira", "prossiga com a primeira", "quero a primeira"],
    2: ["2", "opcao 2", "segunda", "segundo", "a segunda", "prossiga com a segunda", "quero a segunda"],
    3: ["3", "opcao 3", "terceira", "terceiro", "a terceira", "prossiga com a terceira", "quero a terceira"],
    4: ["4", "opcao 4", "quarta", "quarto", "a quarta", "prossiga com a quarta", "quero a quarta"],
    5: ["5", "opcao 5", "quinta", "quinto", "a quinta", "prossiga com a quinta", "quero a quinta"]
  };

  return optionWords[number].some(option => msg === option || msg.includes(option));
}

function mainMenu(saudacao = "") {
  return `${saudacao}entendi.

Para eu te ajudar melhor, escolha uma opção:

1. Quero saber mais sobre o curso
2. Ja tenho curriculo e quero melhorar
3. Envio curriculo e nao recebo retorno
4. Quero acessar ou comprar o curso
5. Estou com problema tecnico

Pode responder com o numero ou escrever, por exemplo: "opcao 1", "segunda opcao" ou "prossiga com a primeira".`;
}

function courseMenu(saudacao = "") {
  return `${saudacao}o curso foi feito para quem quer montar um curriculo mais estrategico e aumentar as chances de ser visto por recrutadores e sistemas automaticos.

Ele ensina sobre:

- palavras-chave da vaga
- curriculo para IA, ATS e Gupy
- resumo profissional
- objetivo profissional
- experiencias
- habilidades
- erros que fazem o curriculo ser ignorado

Agora escolha o proximo passo:

1. Quero ver o que aprendo no curso
2. Quero saber se serve para o meu caso
3. Quero o link para acessar
4. Quero falar com alguem`;
}

function curriculumMenu(saudacao = "") {
  return `${saudacao}perfeito. Como voce ja tem curriculo, o ideal agora e melhorar a estrategia dele.

Geralmente os pontos que mais atrapalham sao:

- curriculo muito generico
- poucas palavras-chave da vaga
- experiencias mal explicadas
- objetivo fraco
- excesso de visual que atrapalha sistemas automaticos

Escolha uma opcao:

1. Quero melhorar para passar pela IA/Gupy
2. Quero adaptar para vagas especificas
3. Quero um checklist rapido do que revisar
4. Quero conhecer o curso`;
}

function noReturnMenu(saudacao = "") {
  return `${saudacao}entendi. Isso acontece muito.

Quando a pessoa envia curriculo e nao recebe retorno, o problema pode estar em:

- falta de palavras-chave
- curriculo igual para todas as vagas
- experiencias pouco claras
- formato ruim para sistemas automaticos
- resumo profissional muito fraco

Escolha uma opcao:

1. Quero entender por que meu curriculo nao passa
2. Quero aprender a adaptar para cada vaga
3. Quero saber como o curso ajuda nisso
4. Quero o link do curso`;
}

function accessMenu(saudacao = "") {
  return `${saudacao}certo. Sobre acesso ou compra, escolha uma opcao:

1. Quero comprar o curso
2. Ja comprei e quero acessar
3. Tive problema no pagamento
4. Quero tirar uma duvida antes de comprar`;
}

function supportMenu(saudacao = "") {
  return `${saudacao}entendi. Para problema tecnico, escolha uma opcao:

1. Erro no cadastro
2. Erro no pagamento
3. Erro no login
4. Curso nao abriu
5. Quero falar com suporte`;
}

export function handleIncomingMessage(text = "", user = null) {
  const msg = normalizeText(text);
  const userKey = getUserKey(user);
  const nome = getFirstName(user);
  const saudacao = nome ? `${nome}, ` : "";
  const currentStage = getStage(userKey);

  let reply = "";

  if (
    msg.includes("menu") ||
    msg.includes("voltar") ||
    msg.includes("inicio") ||
    msg.includes("comecar de novo")
  ) {
    setStage(userKey, "inicio");
    return {
      intent: "menu",
      reply: mainMenu(saudacao)
    };
  }

  if (
    msg.includes("oi") ||
    msg.includes("ola") ||
    msg.includes("opa") ||
    msg.includes("bom dia") ||
    msg.includes("boa tarde") ||
    msg.includes("boa noite")
  ) {
    setStage(userKey, "inicio");
    return {
      intent: "saudacao",
      reply: mainMenu(`${saudacao}oi! Tudo bem? `)
    };
  }

  if (
    msg.includes("saber mais") ||
    msg.includes("sobre o curso") ||
    msg.includes("conteudo") ||
    msg.includes("aulas") ||
    msg.includes("modulo")
  ) {
    setStage(userKey, "curso");
    return {
      intent: "curso",
      reply: courseMenu(saudacao)
    };
  }

  if (
    msg.includes("ja tenho curriculo") ||
    msg.includes("tenho curriculo") ||
    msg.includes("meu curriculo") ||
    msg.includes("curriculo pronto") ||
    msg.includes("passar melhor")
  ) {
    setStage(userKey, "curriculo");
    return {
      intent: "curriculo",
      reply: curriculumMenu(saudacao)
    };
  }

  if (
    msg.includes("nao recebo retorno") ||
    msg.includes("sem retorno") ||
    msg.includes("ninguem chama") ||
    msg.includes("nao chamam") ||
    msg.includes("mando curriculo") ||
    msg.includes("envio curriculo")
  ) {
    setStage(userKey, "sem_retorno");
    return {
      intent: "sem_retorno",
      reply: noReturnMenu(saudacao)
    };
  }

  if (
    msg.includes("comprar") ||
    msg.includes("acessar") ||
    msg.includes("link") ||
    msg.includes("pagamento") ||
    msg.includes("pix") ||
    msg.includes("cartao") ||
    msg.includes("boleto")
  ) {
    setStage(userKey, "acesso");
    return {
      intent: "acesso",
      reply: accessMenu(saudacao)
    };
  }

  if (
    msg.includes("erro") ||
    msg.includes("bug") ||
    msg.includes("travou") ||
    msg.includes("nao abre") ||
    msg.includes("nao consigo") ||
    msg.includes("problema tecnico")
  ) {
    setStage(userKey, "suporte");
    return {
      intent: "suporte",
      reply: supportMenu(saudacao)
    };
  }

  if (currentStage === "inicio") {
    if (isOption(msg, 1)) {
      setStage(userKey, "curso");
      reply = courseMenu(saudacao);
    } else if (isOption(msg, 2)) {
      setStage(userKey, "curriculo");
      reply = curriculumMenu(saudacao);
    } else if (isOption(msg, 3)) {
      setStage(userKey, "sem_retorno");
      reply = noReturnMenu(saudacao);
    } else if (isOption(msg, 4)) {
      setStage(userKey, "acesso");
      reply = accessMenu(saudacao);
    } else if (isOption(msg, 5)) {
      setStage(userKey, "suporte");
      reply = supportMenu(saudacao);
    }
  }

  else if (currentStage === "curso") {
    if (isOption(msg, 1)) {
      reply = `${saudacao}no curso voce aprende a estruturar o curriculo de forma mais estrategica.

Os principais pontos sao:

- como a IA e plataformas como Gupy analisam curriculos
- como usar palavras-chave da vaga
- como escrever experiencias de forma mais forte
- como montar um resumo profissional
- como evitar erros que fazem o curriculo ser ignorado

Agora escolha:

1. Quero saber se serve para mim
2. Quero o link do curso
3. Quero falar com alguem`;
      setStage(userKey, "curso_detalhe");
    } else if (isOption(msg, 2)) {
      reply = `${saudacao}serve principalmente se voce:

- envia curriculo e nao recebe retorno
- quer melhorar o curriculo atual
- quer passar melhor por IA, ATS ou Gupy
- quer adaptar o curriculo para vagas especificas
- nao sabe como destacar suas experiencias

Escolha:

1. Sim, esse e meu caso
2. Quero o link do curso
3. Quero tirar outra duvida`;
      setStage(userKey, "curso_caso");
    } else if (isOption(msg, 3)) {
      reply = `${saudacao}claro. Voce pode acessar a pagina do curso por aqui:

https://gustavosales2001.github.io/Cursos_Love/

Se quiser, tambem posso te explicar antes o que voce vai encontrar na pagina.

1. Quero acessar agora
2. Quero entender melhor antes
3. Quero falar com suporte`;
      setStage(userKey, "link_enviado");
    } else if (isOption(msg, 4)) {
      reply = `${saudacao}claro. Me diga se voce quer falar sobre:

1. Duvidas do curso
2. Pagamento
3. Acesso ou problema tecnico`;
      setStage(userKey, "humano");
    }
  }

  else if (currentStage === "curriculo") {
    if (isOption(msg, 1)) {
      reply = `${saudacao}para passar melhor por IA, ATS e Gupy, o curriculo precisa estar claro, bem organizado e com palavras-chave da vaga.

O curso mostra como fazer isso sem inventar informacao e sem deixar o curriculo artificial.

Escolha:

1. Quero ver um checklist rapido
2. Quero conhecer o curso
3. Quero o link`;
      setStage(userKey, "curriculo_ia");
    } else if (isOption(msg, 2)) {
      reply = `${saudacao}adaptar o curriculo para cada vaga e um dos pontos mais importantes.

Voce nao precisa refazer tudo. O ideal e ajustar:

- objetivo
- resumo
- habilidades
- palavras-chave
- experiencias mais relevantes

Escolha:

1. Quero aprender isso
2. Quero o link do curso
3. Quero tirar uma duvida`;
      setStage(userKey, "curriculo_adaptar");
    } else if (isOption(msg, 3)) {
      reply = `${saudacao}checklist rapido para revisar seu curriculo:

1. O objetivo esta alinhado com a vaga?
2. Tem palavras-chave da descricao da vaga?
3. Suas experiencias mostram tarefas e resultados?
4. O arquivo esta facil de ler?
5. O curriculo esta adaptado para a vaga?
6. Nao tem excesso de imagem, tabela ou coluna?
7. O resumo profissional esta claro?

Agora escolha:

1. Quero aprender a ajustar isso
2. Quero o link do curso
3. Quero falar com alguem`;
      setStage(userKey, "checklist");
    } else if (isOption(msg, 4)) {
      setStage(userKey, "curso");
      reply = courseMenu(saudacao);
    }
  }

  else if (currentStage === "sem_retorno") {
    if (isOption(msg, 1)) {
      reply = `${saudacao}se seu curriculo nao passa, pode ser porque ele nao esta conectado com a vaga.

Muitos sistemas procuram termos especificos, cargos, habilidades e experiencias parecidas com o que a empresa pediu.

Se o curriculo estiver muito generico, ele pode ser ignorado antes mesmo de chegar no recrutador.

Escolha:

1. Quero aprender a corrigir isso
2. Quero saber como o curso ajuda
3. Quero o link`;
      setStage(userKey, "sem_retorno_motivo");
    } else if (isOption(msg, 2)) {
      reply = `${saudacao}para adaptar para cada vaga, voce precisa olhar a descricao da vaga e ajustar seu curriculo com base no que ela pede.

Exemplo:
se a vaga pede atendimento, organizacao e Excel, essas palavras precisam aparecer de forma natural se voce realmente tem essas habilidades.

Escolha:

1. Quero aprender o passo a passo
2. Quero conhecer o curso
3. Quero o link`;
      setStage(userKey, "sem_retorno_adaptar");
    } else if (isOption(msg, 3)) {
      setStage(userKey, "curso");
      reply = courseMenu(saudacao);
    } else if (isOption(msg, 4)) {
      reply = `${saudacao}claro. Link do curso:

https://gustavosales2001.github.io/Cursos_Love/

Escolha:

1. Quero acessar agora
2. Quero tirar uma duvida
3. Tive problema no acesso ou pagamento`;
      setStage(userKey, "link_enviado");
    }
  }

  else if (currentStage === "acesso") {
    if (isOption(msg, 1)) {
      reply = `${saudacao}para comprar, acesse a pagina do curso:

https://gustavosales2001.github.io/Cursos_Love/

Depois escolha a forma de pagamento disponivel na pagina.

Se der qualquer erro, me envie um print.

1. Ja acessei
2. Deu erro no pagamento
3. Quero tirar duvida antes`;
      setStage(userKey, "link_enviado");
    } else if (isOption(msg, 2)) {
      reply = `${saudacao}se voce ja comprou, tente acessar usando o mesmo e-mail cadastrado na compra.

Se nao liberar, me envie:

- nome
- e-mail usado na compra
- print do erro

Escolha:

1. Vou enviar os dados
2. Quero falar com suporte`;
      setStage(userKey, "acesso_comprou");
    } else if (isOption(msg, 3)) {
      reply = `${saudacao}se deu problema no pagamento, me diga em qual forma aconteceu:

1. Pix
2. Cartao
3. Boleto
4. A pagina travou`;
      setStage(userKey, "pagamento_erro");
    } else if (isOption(msg, 4)) {
      setStage(userKey, "curso");
      reply = courseMenu(saudacao);
    }
  }

  else if (currentStage === "suporte") {
    if (isOption(msg, 1) || isOption(msg, 2) || isOption(msg, 3) || isOption(msg, 4)) {
      reply = `${saudacao}certo. Para eu verificar melhor, me envie um print da tela e descreva rapidamente o que aconteceu.

Exemplo:
"tentei pagar no Pix e a pagina travou"
ou
"comprei, mas nao consigo entrar"

Depois disso eu consigo te direcionar melhor.

1. Vou enviar o print
2. Quero falar com suporte`;
      setStage(userKey, "aguardando_print");
    } else if (isOption(msg, 5)) {
      reply = `${saudacao}claro. Me envie seu nome, e-mail de cadastro e um print do problema para o suporte verificar.`;
      setStage(userKey, "suporte_humano");
    }
  }

  else if (
    currentStage === "curso_detalhe" ||
    currentStage === "curso_caso" ||
    currentStage === "curriculo_ia" ||
    currentStage === "curriculo_adaptar" ||
    currentStage === "checklist" ||
    currentStage === "sem_retorno_motivo" ||
    currentStage === "sem_retorno_adaptar"
  ) {
    if (isOption(msg, 1)) {
      reply = `${saudacao}perfeito. O melhor caminho e comecar entendendo onde seu curriculo esta falhando: estrutura, palavras-chave ou descricao das experiencias.

O curso te guia por esse processo de forma pratica.

Escolha:

1. Quero o link do curso
2. Quero tirar mais uma duvida
3. Quero voltar ao menu`;
      setStage(userKey, "decisao");
    } else if (isOption(msg, 2)) {
      reply = `${saudacao}link do curso:

https://gustavosales2001.github.io/Cursos_Love/

Escolha:

1. Quero acessar agora
2. Tenho uma duvida antes
3. Tive problema tecnico`;
      setStage(userKey, "link_enviado");
    } else if (isOption(msg, 3)) {
      reply = `${saudacao}sem problema. Me diga sua duvida principal ou escolha uma opcao:

1. Conteudo do curso
2. Pagamento
3. Acesso
4. Curriculo sem retorno`;
      setStage(userKey, "inicio");
    }
  }

  else if (currentStage === "decisao" || currentStage === "link_enviado") {
    if (isOption(msg, 1)) {
      reply = `${saudacao}perfeito. Acesse por aqui:

https://gustavosales2001.github.io/Cursos_Love/

Se tiver qualquer erro na pagina, me mande um print.`;
      setStage(userKey, "fim");
    } else if (isOption(msg, 2)) {
      reply = `${saudacao}claro. Pode me mandar sua duvida.

Se preferir, escolha:

1. Conteudo do curso
2. Pagamento
3. Acesso
4. Curriculo sem retorno`;
      setStage(userKey, "inicio");
    } else if (isOption(msg, 3)) {
      setStage(userKey, "suporte");
      reply = supportMenu(saudacao);
    }
  }

  if (!reply) {
    reply = mainMenu(saudacao);
    setStage(userKey, "inicio");
  }

  return {
    intent: currentStage,
    reply
  };
}

export default handleIncomingMessage;
