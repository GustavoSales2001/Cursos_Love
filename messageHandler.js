export function handleIncomingMessage(text = "", user = null) {
  const msg = String(text || "").toLowerCase();

  const nome = user?.name ? user.name.split(" ")[0] : "";
  const saudacao = nome ? `${nome}, ` : "";

  let reply = `${saudacao}entendi.

Para eu te ajudar melhor, me conta se sua dúvida é sobre:

1. Acesso ao curso
2. Pagamento
3. Currículo
4. Problema técnico`;

  if (msg.includes("oi") || msg.includes("olá") || msg.includes("ola")) {
    reply = `${saudacao}Oi! Tudo bem?

Você quer ajuda com acesso ao curso, pagamento ou tem alguma dúvida sobre currículo?`;
  }

  if (msg.includes("pagamento") || msg.includes("pix") || msg.includes("cartão") || msg.includes("cartao")) {
    reply = `O pagamento é feito pela página do curso.

Se aparecer algum erro, me manda um print da tela para eu verificar melhor.`;
  }

  if (msg.includes("acesso") || msg.includes("login") || msg.includes("senha") || msg.includes("entrar")) {
    reply = `Para acessar, use o mesmo e-mail cadastrado na compra.

Se o acesso não liberar, me envie o e-mail usado no cadastro para verificarmos.`;
  }

  if (msg.includes("curriculo") || msg.includes("currículo") || msg.includes("gupy") || msg.includes("ia")) {
    reply = `O curso te ajuda a montar um currículo mais estratégico para passar melhor por filtros automáticos, como IA, ATS e plataformas como Gupy.

Me conta: hoje seu maior problema é não receber retorno ou não saber como montar o currículo?`;
  }

  if (msg.includes("erro") || msg.includes("bug") || msg.includes("travou") || msg.includes("não abre") || msg.includes("nao abre")) {
    reply = `Entendi. Parece ser um problema técnico.

Me manda um print da tela e me fala em qual parte travou: cadastro, pagamento ou acesso?`;
  }

  return {
    intent: "auto_reply",
    reply
  };
}

export default handleIncomingMessage;
