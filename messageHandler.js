export function handleIncomingMessage(text = "", user = null) {
  const msg = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const nome = user?.name ? user.name.split(" ")[0] : "";
  const saudacao = nome ? `${nome}, ` : "";

  let reply = `${saudacao}entendi.

Para eu te ajudar melhor, me conta qual é a sua maior dúvida agora:

1. Acesso ao curso
2. Pagamento
3. Conteúdo do curso
4. Currículo sem retorno
5. Problema técnico`;

  if (msg.includes("oi") || msg.includes("ola") || msg.includes("opa") || msg.includes("bom dia") || msg.includes("boa tarde") || msg.includes("boa noite")) {
    reply = `${saudacao}Oi! Tudo bem?

Me conta rapidinho: você quer ajuda com acesso ao curso, pagamento ou quer entender melhor como o curso pode te ajudar com currículo?`;
  }

  else if (msg.includes("acesso") || msg.includes("login") || msg.includes("senha") || msg.includes("entrar")) {
    reply = `${saudacao}para acessar, use o mesmo e-mail cadastrado na compra.

Se o acesso ainda não liberar, me envie o e-mail usado no cadastro para verificarmos.`;
  }

  else if (msg.includes("pagamento") || msg.includes("pix") || msg.includes("cartao") || msg.includes("boleto") || msg.includes("pagar")) {
    reply = `${saudacao}o pagamento é feito pela página do curso.

Se aparecer algum erro, me manda um print da tela e me fala se foi no Pix, cartão ou boleto.`;
  }

  else if (
    msg.includes("saber mais") ||
    msg.includes("sobre o curso") ||
    msg.includes("curso") ||
    msg.includes("conteudo") ||
    msg.includes("aulas") ||
    msg.includes("modulo")
  ) {
    reply = `${saudacao}o curso foi feito para quem envia currículo, mas sente que não recebe retorno.

Ele te mostra como estruturar o currículo para ser mais claro para recrutadores e também para sistemas automáticos, como IA, ATS e plataformas como Gupy.

Você aprende a ajustar:

- palavras-chave da vaga
- experiências profissionais
- resumo profissional
- objetivo
- habilidades
- estrutura do currículo
- erros que fazem o currículo ser ignorado

Me conta uma coisa: hoje você já tem currículo pronto ou ainda vai montar do zero?`;
  }

  else if (
    msg.includes("nao receber retorno") ||
    msg.includes("nao recebo retorno") ||
    msg.includes("sem retorno") ||
    msg.includes("ninguem chama") ||
    msg.includes("nao chamam") ||
    msg.includes("mando curriculo") ||
    msg.includes("envio curriculo")
  ) {
    reply = `${saudacao}entendi. Isso acontece muito.

Às vezes a pessoa tem experiência, mas o currículo não está falando a mesma linguagem da vaga ou dos sistemas que fazem a triagem.

O problema pode estar em pontos como:

- falta de palavras-chave
- objetivo muito genérico
- experiências pouco explicadas
- currículo muito visual e pouco legível
- informações importantes escondidas
- falta de adaptação para cada vaga

O curso entra exatamente nessa parte: te ensina a deixar o currículo mais estratégico, sem inventar informação e sem parecer artificial.

Você costuma mandar o mesmo currículo para todas as vagas ou adapta de acordo com cada oportunidade?`;
  }

  else if (
    msg.includes("curriculo") ||
    msg.includes("gupy") ||
    msg.includes("ia") ||
    msg.includes("ats") ||
    msg.includes("filtro")
  ) {
    reply = `${saudacao}o currículo hoje precisa ser claro para duas leituras: a do recrutador e a dos sistemas automáticos.

Muitas plataformas analisam palavras-chave, cargos, experiências, habilidades e organização do documento.

O curso te ajuda a entender essa lógica e ajustar seu currículo para aumentar as chances de ele ser visto.

Me conta: seu maior problema é montar o currículo ou fazer ele passar melhor nas candidaturas?`;
  }

  else if (msg.includes("link") || msg.includes("comprar") || msg.includes("quero acessar") || msg.includes("onde acesso")) {
    reply = `${saudacao}claro. Antes de te mandar o caminho, só quero entender melhor para te orientar certo.

Você quer acessar porque está com dificuldade no currículo, porque não recebe retorno ou porque quer melhorar seu perfil para novas vagas?`;
  }

  else if (msg.includes("erro") || msg.includes("bug") || msg.includes("travou") || msg.includes("nao abre") || msg.includes("problema tecnico")) {
    reply = `${saudacao}entendi. Parece ser um problema técnico.

Me manda um print da tela e me fala em qual parte travou:

- cadastro
- pagamento
- login
- acesso ao curso

Assim conseguimos verificar melhor.`;
  }

  else if (msg.includes("obrigado") || msg.includes("obrigada") || msg.includes("valeu")) {
    reply = `${saudacao}por nada.

Me conta só uma coisa: você quer entender melhor o conteúdo do curso ou quer ajuda com alguma dificuldade específica no seu currículo?`;
  }

  else if (msg.includes("sim") || msg.includes("quero") || msg.includes("tenho interesse")) {
    reply = `${saudacao}perfeito.

Então me conta qual é sua situação hoje:

Você já está enviando currículo e não recebe retorno, ou ainda está montando seu primeiro currículo?`;
  }

  return {
    intent: "auto_reply",
    reply
  };
}

export default handleIncomingMessage;
