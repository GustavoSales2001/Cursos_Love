import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import crypto from "crypto";
import { MercadoPagoConfig, Payment } from "mercadopago";

dotenv.config();

const app = express();
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const port = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.use(express.json());

function cleanEnv(value = "") {
  return String(value || "")
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/^'(.*)'$/, "$1")
    .trim();
}

const allowedOrigins = cleanEnv(process.env.FRONTEND_URL)
  .split(",")
  .map((v) => cleanEnv(v))
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
if (!origin || origin === "null") return callback(null, true);
      const allowed = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://gustavosales2001.github.io"
      ];

      if (allowed.includes(origin)) {
        return callback(null, true);
      }

      console.log("CORS bloqueado:", origin);
      return callback(new Error("Origem não permitida pelo CORS."));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
  })
);

if (!cleanEnv(process.env.MERCADO_PAGO_ACCESS_TOKEN)) {
  throw new Error("Defina MERCADO_PAGO_ACCESS_TOKEN no .env");
}

const client = new MercadoPagoConfig({
  accessToken: cleanEnv(process.env.MERCADO_PAGO_ACCESS_TOKEN),
  options: { timeout: 5000 }
});

const paymentClient = new Payment(client);

let pool;
let whatsappJobRunning = false;

/* TESTE: envia apenas para um usuário específico */
//const TEST_ONLY_USER_IDS = [7, 125];

function getWhatsAppConfig() {
  const token = cleanEnv(process.env.WHATSAPP_TOKEN);
  const phoneNumberId = cleanEnv(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const templateName = cleanEnv(process.env.WHATSAPP_TEMPLATE_NAME) || "hello_world";
  const verifyToken = cleanEnv(process.env.WHATSAPP_VERIFY_TOKEN);
  const apiVersion = cleanEnv(process.env.WHATSAPP_API_VERSION) || "v25.0";
  const templateLanguage = cleanEnv(process.env.WHATSAPP_TEMPLATE_LANGUAGE) || "en_US";

  return {
    token,
    phoneNumberId,
    templateName,
    verifyToken,
    apiVersion,
    templateLanguage
  };
}

function getWhatsAppMessagesUrl() {
  const { phoneNumberId, apiVersion } = getWhatsAppConfig();

  if (!phoneNumberId) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID não configurado.");
  }

  return `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
}

async function initDB() {
  pool = mysql.createPool({
    host: cleanEnv(process.env.MYSQLHOST),
    port: Number(cleanEnv(process.env.MYSQLPORT) || 3306),
    user: cleanEnv(process.env.MYSQLUSER),
    password: cleanEnv(process.env.MYSQLPASSWORD),
    database: cleanEnv(process.env.MYSQL_DATABASE),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  console.log("MYSQLHOST:", cleanEnv(process.env.MYSQLHOST));
  console.log("MYSQLPORT:", cleanEnv(process.env.MYSQLPORT));
  console.log("MYSQLUSER:", cleanEnv(process.env.MYSQLUSER));
  console.log("MYSQL_DATABASE:", cleanEnv(process.env.MYSQL_DATABASE));

  await pool.query("SELECT 1");
  console.log("MySQL conectado com sucesso.");
}

function sanitizeCpf(value = "") {
  return String(value).replace(/\D/g, "");
}

function generateAccessToken() {
  return crypto.randomBytes(24).toString("hex");
}

function normalizePhoneBR(phone = "") {
  let digits = String(phone).replace(/\D/g, "");

  if (!digits) return "";

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  return digits;
}

function getFinalTestPhone(user) {
  return normalizePhoneBR(user.celular);
}

function getEnvStatus() {
  const wa = getWhatsAppConfig();

  return {
    node_env: cleanEnv(process.env.NODE_ENV) || null,
    port: port || null,
    frontend_url_configured: Boolean(cleanEnv(process.env.FRONTEND_URL)),
    mysql: {
      host: cleanEnv(process.env.MYSQLHOST) || null,
      port: cleanEnv(process.env.MYSQLPORT) || null,
      user: cleanEnv(process.env.MYSQLUSER) || null,
      database: cleanEnv(process.env.MYSQL_DATABASE) || null,
      password_configured: Boolean(cleanEnv(process.env.MYSQLPASSWORD))
    },
    mercado_pago: {
      access_token_configured: Boolean(cleanEnv(process.env.MERCADO_PAGO_ACCESS_TOKEN)),
      public_key_configured: Boolean(cleanEnv(process.env.MERCADO_PAGO_PUBLIC_KEY)),
      webhook_base_url: cleanEnv(process.env.WEBHOOK_BASE_URL) || null
    },
    whatsapp: {
      token_configured: Boolean(wa.token),
      phone_number_id: wa.phoneNumberId || null,
      verify_token_configured: Boolean(wa.verifyToken),
      verify_token_preview: wa.verifyToken ? `${wa.verifyToken.slice(0, 6)}...` : null,
      template_name: wa.templateName || null,
      api_version: wa.apiVersion,
      template_language: wa.templateLanguage
    },
    claude: {
      api_key_configured: Boolean(cleanEnv(process.env.CLAUDE_API_KEY)),
      model: cleanEnv(process.env.CLAUDE_MODEL) || null
    }
  };
}

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NULL,
      email VARCHAR(191) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NULL,
      celular VARCHAR(30) NULL,
      nascimento VARCHAR(30) NULL,
      area VARCHAR(100) NULL,
      access_released TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  const [columns] = await pool.query("SHOW COLUMNS FROM users");
  const columnNames = columns.map(col => col.Field);

  if (!columnNames.includes("celular")) {
    await pool.query("ALTER TABLE users ADD COLUMN celular VARCHAR(30) NULL");
  }

  if (!columnNames.includes("nascimento")) {
    await pool.query("ALTER TABLE users ADD COLUMN nascimento VARCHAR(30) NULL");
  }

  if (!columnNames.includes("area")) {
    await pool.query("ALTER TABLE users ADD COLUMN area VARCHAR(100) NULL");
  }

  if (!columnNames.includes("whatsapp_sent")) {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN whatsapp_sent TINYINT(1) NOT NULL DEFAULT 0
    `);
  }

  if (!columnNames.includes("whatsapp_sent_at")) {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN whatsapp_sent_at TIMESTAMP NULL DEFAULT NULL
    `);
  }

  if (!columnNames.includes("last_whatsapp_message_at")) {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN last_whatsapp_message_at TIMESTAMP NULL DEFAULT NULL
    `);
  }

  if (!columnNames.includes("whatsapp_opt_in")) {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN whatsapp_opt_in TINYINT(1) NOT NULL DEFAULT 1
    `);
  }

  if (!columnNames.includes("whatsapp_followup_count")) {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN whatsapp_followup_count TINYINT(1) NOT NULL DEFAULT 0
    `);
  }

  if (!columnNames.includes("whatsapp_followup_finished")) {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN whatsapp_followup_finished TINYINT(1) NOT NULL DEFAULT 0
    `);
  }

  if (!columnNames.includes("last_customer_message_at")) {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN last_customer_message_at TIMESTAMP NULL DEFAULT NULL
    `);
  }

  if (!columnNames.includes("last_bot_message_at")) {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN last_bot_message_at TIMESTAMP NULL DEFAULT NULL
    `);
  }

  if (!columnNames.includes("bot_paused")) {
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN bot_paused TINYINT(1) NOT NULL DEFAULT 0
    `);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      payment_id VARCHAR(100) NOT NULL UNIQUE,
      payment_type VARCHAR(30) NOT NULL,
      status VARCHAR(50) NOT NULL,
      status_detail VARCHAR(100) NULL,
      transaction_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      description VARCHAR(255) NULL,
      payer_email VARCHAR(191) NOT NULL,
      external_reference VARCHAR(100) NULL,
      access_token VARCHAR(100) NULL,
      raw_response JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_payments_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_events (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      payment_id VARCHAR(100) NULL,
      event_type VARCHAR(100) NULL,
      action_name VARCHAR(100) NULL,
      raw_payload JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      celular VARCHAR(30) NOT NULL,
      direction ENUM('in','out') NOT NULL,
      message_text TEXT NULL,
      wa_message_id VARCHAR(120) NULL,
      raw_payload JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_celular (celular),
      CONSTRAINT fk_whatsapp_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL
    )
  `);
}

async function findOrCreateUser({ name, email }) {
  const [rows] = await pool.query(
    `SELECT id, email, name, celular, nascimento, area, access_released
     FROM users
     WHERE email = ?
     LIMIT 1`,
    [email]
  );

  if (rows.length > 0) {
    return rows[0];
  }

  const [result] = await pool.query(
    `INSERT INTO users (name, email)
     VALUES (?, ?)`,
    [name || null, email]
  );

  return {
    id: result.insertId,
    name: name || null,
    email,
    celular: null,
    nascimento: null,
    area: null,
    access_released: 0
  };
}

async function savePayment({
  userId,
  paymentId,
  paymentType,
  status,
  statusDetail,
  amount,
  description,
  payerEmail,
  externalReference,
  rawResponse
}) {
  const accessToken = generateAccessToken();

  await pool.query(
    `
    INSERT INTO payments (
      user_id,
      payment_id,
      payment_type,
      status,
      status_detail,
      transaction_amount,
      description,
      payer_email,
      external_reference,
      access_token,
      raw_response
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      status = VALUES(status),
      status_detail = VALUES(status_detail),
      transaction_amount = VALUES(transaction_amount),
      description = VALUES(description),
      payer_email = VALUES(payer_email),
      external_reference = VALUES(external_reference),
      raw_response = VALUES(raw_response),
      updated_at = CURRENT_TIMESTAMP
    `,
    [
      userId || null,
      String(paymentId),
      paymentType,
      status,
      statusDetail || null,
      Number(amount || 0),
      description || null,
      payerEmail,
      externalReference || null,
      accessToken,
      JSON.stringify(rawResponse || {})
    ]
  );

  return accessToken;
}

async function markAccessReleased(paymentId, email) {
  await pool.query(
    `
    UPDATE payments
    SET status = 'approved', updated_at = CURRENT_TIMESTAMP
    WHERE payment_id = ?
    `,
    [String(paymentId)]
  );

  if (email) {
    await pool.query(
      `
      UPDATE users
      SET access_released = 1, updated_at = CURRENT_TIMESTAMP
      WHERE email = ?
      `,
      [email]
    );
  }
}

async function saveWhatsappMessage({
  userId = null,
  celular,
  direction,
  messageText = "",
  waMessageId = null,
  rawPayload = {}
}) {
  await pool.query(
    `
    INSERT INTO whatsapp_messages (
      user_id, celular, direction, message_text, wa_message_id, raw_payload
    ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      userId,
      celular,
      direction,
      messageText || null,
      waMessageId || null,
      JSON.stringify(rawPayload || {})
    ]
  );
}

async function sendWhatsAppText(to, text) {
  const wa = getWhatsAppConfig();
  const url = getWhatsAppMessagesUrl();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${wa.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Erro Meta WhatsApp texto:", JSON.stringify(data, null, 2));
    throw new Error(data?.error?.message || "Erro ao enviar WhatsApp");
  }

  return data;
}

async function sendWhatsAppTemplate(to, templateName = "hello_world") {
  const wa = getWhatsAppConfig();
  const url = getWhatsAppMessagesUrl();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${wa.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: cleanEnv(templateName || wa.templateName || "hello_world"),
        language: { code: wa.templateLanguage }
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Erro Meta WhatsApp template:", JSON.stringify(data, null, 2));
    throw new Error(data?.error?.message || "Erro ao enviar template WhatsApp");
  }

  return data;
}

async function getUserByPhone(celular) {
  const normalized = normalizePhoneBR(celular);

  const [rows] = await pool.query(
    `
    SELECT id, name, email, celular, access_released, whatsapp_sent, bot_paused
    FROM users
    WHERE 
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(celular, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') LIKE ?
  OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(celular, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') LIKE ?
  OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(celular, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') LIKE ?
    LIMIT 1
    `,
    [
  `%${normalized.slice(-11)}`,
  `%${normalized.slice(-10)}`,
  `%${normalized.slice(-9)}`
    ]
  );

  return rows[0] || null;
}

async function getPendingWhatsappUsers() {
  const [rows] = await pool.query(
    `
    SELECT id, name, celular
      FROM users
      WHERE id >= 100
      AND access_released = 0
      AND whatsapp_sent = 0
      AND whatsapp_opt_in = 1
      AND bot_paused = 0
      AND celular IS NOT NULL
      AND celular <> ''
      AND created_at <= NOW() - INTERVAL 1 MINUTE
    `
  );

  return rows;
}

async function markWhatsappSent(userId) {
  await pool.query(
    `
    UPDATE users
    SET whatsapp_sent = 1,
        whatsapp_sent_at = NOW(),
        last_whatsapp_message_at = NOW(),
        last_bot_message_at = NOW(),
        whatsapp_followup_count = 0,
        whatsapp_followup_finished = 0,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
    [userId]
  );
}

function buildCustomerReply(text = "", user = null) {
  const rawMsg = String(text || "");
  const msg = normalizeText(rawMsg);

  const linkCurso = "https://gustavosales2001.github.io/Cursos_Love/";
  const whatsappMilene = "5511922198936"; // Especialista Milene - dúvidas sobre currículo, curso e orientação
  const whatsappGustavo = "5511933128628"; // Gustavo Desenvolvedor - erro, acesso, login, bug e problemas técnicos

  const nome = user?.name ? user.name.split(" ")[0] : "";
  const saudacao = nome ? `${nome}, ` : "";

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function hasAny(text, keywords) {
    return keywords.some(k => text.includes(normalizeText(k)));
  }

  function linkMilene() {
    return `https://wa.me/${whatsappMilene}`;
  }

  function linkGustavo() {
    return `https://wa.me/${whatsappGustavo}`;
  }

  // =====================================================
  // 1. SAUDAÇÃO / INÍCIO DE CONVERSA
  // =====================================================
  if (hasAny(msg, ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "eai", "e aí", "opa"])) {
    return `${saudacao}oi 😊

Que bom que você chamou!

Antes de te mandar qualquer coisa, me conta rapidinho: você quer entender melhor o curso ou está com alguma dúvida sobre currículo, vagas, IA, Gupy, LinkedIn ou processos seletivos?

Pode falar tranquilo. A ideia aqui é te ajudar primeiro, sem pressa.`;
  }

  // =====================================================
  // 2. TUDO BEM / QUEBRA DE GELO
  // =====================================================
  if (hasAny(msg, ["tudo bem", "td bem", "como vai", "como voce esta", "como você está"])) {
    return `Tudo certo por aqui 😊

E com você?

Me conta um pouco da sua situação: você já tem currículo pronto, está começando agora ou está mandando currículo e não recebendo retorno?

Com isso consigo te orientar melhor.`;
  }

  // =====================================================
  // 3. DÚVIDA GERAL
  // =====================================================
  if (hasAny(msg, ["tenho duvida", "tenho dúvida", "duvida", "dúvida", "nao entendi", "não entendi", "pode explicar", "explica melhor"])) {
    return `${saudacao}claro, pode perguntar 😊

Se for dúvida sobre currículo, vaga, curso, IA, Gupy, LinkedIn ou como melhorar suas chances nos processos seletivos, posso te orientar por aqui.

Me manda sua dúvida com calma que eu tento te ajudar da melhor forma.`;
  }

  // =====================================================
  // 4. SOBRE O CURSO / COMO FUNCIONA
  // =====================================================
  if (hasAny(msg, ["como funciona", "funciona", "me explica", "saber mais", "mais informacoes", "mais informações", "sobre o curso", "curso"])) {
    return `Claro 😊

O curso “Currículo que Vence a IA” foi criado para ajudar pessoas que estão enviando currículo e não conseguem retorno, ou que querem montar um currículo mais estratégico.

Hoje muitas empresas usam filtros automáticos, como IA, ATS, Gupy e outros sistemas. Então não basta ter experiência: o currículo precisa estar organizado de um jeito que esses sistemas consigam ler e entender.

No curso você aprende:

✔ como a IA analisa um currículo  
✔ como organizar suas experiências  
✔ como usar palavras-chave da vaga  
✔ como evitar erros que eliminam seu currículo  
✔ como montar uma versão mais profissional  
✔ como adaptar o currículo para diferentes vagas  

Se você quiser, também posso te passar o link para acessar a página do curso.`;
  }

  // =====================================================
  // 5. IA / ATS / GUPY / ROBÔ
  // =====================================================
  if (hasAny(msg, ["ia", "ats", "gupy", "robo", "robô", "filtro", "sistema automatico", "sistema automático", "triagem automatica", "triagem automática"])) {
    return `Boa pergunta 👀

Hoje muitas empresas usam sistemas automáticos para filtrar currículos antes do recrutador ver.

Esses sistemas procuram principalmente:

✔ palavras-chave parecidas com a vaga  
✔ cargo e área de atuação  
✔ experiências bem descritas  
✔ formação e cursos  
✔ organização clara  
✔ informações fáceis de encontrar  

O problema é que muita gente tem capacidade, mas o currículo está escrito de um jeito que o sistema não entende bem.

O curso te ensina a ajustar isso de forma prática, sem inventar informação e sem deixar o currículo artificial.`;
  }

  // =====================================================
  // 6. PREÇO / VALOR / CUSTO
  // =====================================================
  if (hasAny(msg, ["preco", "preço", "valor", "quanto custa", "custa", "custo", "investimento"])) {
    return `Você consegue ver o valor atualizado direto na página do curso:

${linkCurso}

Antes de decidir, vale pensar assim: o objetivo do curso é te ajudar a melhorar um ponto que pode estar travando suas oportunidades — o currículo.

Se você está enviando currículo e quase não recebe retorno, talvez o problema não seja sua capacidade, mas a forma como suas informações estão sendo apresentadas.`;
  }

  // =====================================================
  // 7. LINK / ACESSAR / COMPRAR
  // =====================================================
  if (hasAny(msg, ["link", "acessar", "comprar", "quero comprar", "onde compro", "onde acesso", "pagina", "página"])) {
    return `Claro 😊

Você pode acessar por aqui:

${linkCurso}

Antes de entrar, se tiver qualquer dúvida sobre o curso, currículo ou se ele serve para o seu momento, pode perguntar.`;
  }

  // =====================================================
  // 8. DESCONTO / PROMOÇÃO / CUPOM
  // =====================================================
  if (hasAny(msg, ["desconto", "promocao", "promoção", "cupom", "oferta", "condicao especial", "condição especial"])) {
    return `A condição disponível aparece direto na página do curso:

${linkCurso}

O mais importante é você analisar se o conteúdo faz sentido para o que você precisa agora.

Se sua dificuldade é currículo, falta de retorno, Gupy, IA ou como se apresentar melhor nas vagas, esse curso foi feito justamente para isso.`;
  }

  // =====================================================
  // 9. PAGAMENTO / PIX / CARTÃO / BOLETO
  // =====================================================
  if (hasAny(msg, ["pagamento", "pagar", "pix", "cartao", "cartão", "boleto", "mercado pago", "credito", "crédito", "debito", "débito"])) {
    return `O pagamento é feito pela própria página do curso:

${linkCurso}

Você acessa, faz seu cadastro ou entra com login, e segue para a parte de pagamento.

Se aparecer erro, tela travada, pagamento não carregar, problema de login ou qualquer falha técnica, fale direto com o Gustavo, desenvolvedor:

👉 ${linkGustavo()}`;
  }

  // =====================================================
  // 10. ERRO / BUG / PROBLEMA TÉCNICO
  // =====================================================
  if (hasAny(msg, ["erro", "bug", "travou", "nao abre", "não abre", "pagina nao abre", "página não abre", "deu problema", "problema tecnico", "problema técnico", "falha", "carregando", "tela branca", "nao carrega", "não carrega"])) {
    return `Entendi 👀

Isso parece ser algo técnico, então o melhor caminho é falar direto com o Gustavo, que é o desenvolvedor.

Ele consegue verificar erro de página, acesso, login, pagamento travado ou qualquer problema técnico.

👉 ${linkGustavo()}

Se puder, mande também um print da tela e explique em qual parte travou. Isso ajuda ele a resolver mais rápido.`;
  }

  // =====================================================
  // 11. LOGIN / SENHA / ACESSO / CADASTRO
  // =====================================================
  if (hasAny(msg, ["login", "senha", "cadastro", "entrar", "acesso", "area do aluno", "área do aluno", "nao consigo acessar", "não consigo acessar", "liberar acesso"])) {
    return `Você acessa pela página:

${linkCurso}

Se ainda não tiver conta, faça o cadastro.  
Se já tiver conta, entre com seu login.

Agora, se estiver dando erro, senha não funciona, acesso não libera, página trava ou aparece alguma mensagem estranha, fale com o Gustavo:

👉 ${linkGustavo()}

Ele é o responsável por resolver problemas técnicos e de acesso.`;
  }

  // =====================================================
  // 12. MÓDULOS / AULAS / CONTEÚDO
  // =====================================================
  if (hasAny(msg, ["modulo", "módulo", "modulos", "módulos", "aula", "aulas", "conteudo", "conteúdo", "material", "materiais", "pdf", "checklist"])) {
    return `O curso é organizado para ser direto e prático.

Você aprende sobre:

1️⃣ como a IA e os sistemas ATS analisam currículos  
2️⃣ como estruturar melhor suas informações  
3️⃣ como escrever experiências de forma mais estratégica  
4️⃣ como usar palavras-chave da vaga  
5️⃣ como adaptar o currículo para cada oportunidade  
6️⃣ como evitar erros comuns que atrapalham a triagem  
7️⃣ como deixar o currículo mais claro para recrutadores  

A ideia não é só “fazer um currículo bonito”, mas montar um currículo que comunique melhor seu valor.`;
  }

  // =====================================================
  // 13. PRIMEIRO EMPREGO / SEM EXPERIÊNCIA
  // =====================================================
  if (hasAny(msg, ["primeiro emprego", "sem experiencia", "sem experiência", "nunca trabalhei", "nao tenho experiencia", "não tenho experiência", "sem registro", "sem carteira assinada"])) {
    return `Serve sim 😊

Mesmo sem experiência formal, dá para montar um currículo mais forte.

Você pode destacar:

✔ cursos  
✔ formação  
✔ habilidades  
✔ projetos pessoais  
✔ trabalhos informais  
✔ voluntariado  
✔ objetivos profissionais  
✔ disponibilidade e vontade de aprender  

O erro de muita gente é deixar o currículo vazio ou muito genérico. O curso ajuda a organizar essas informações de um jeito mais profissional.`;
  }

  // =====================================================
  // 14. ESTÁGIO / JOVEM APRENDIZ / FACULDADE
  // =====================================================
  if (hasAny(msg, ["estagio", "estágio", "jovem aprendiz", "aprendiz", "faculdade", "universidade", "estudante"])) {
    return `Serve muito para estágio e jovem aprendiz 😊

Nesses casos, o recrutador não espera uma experiência enorme. Ele procura potencial, organização, clareza e compatibilidade com a vaga.

O currículo precisa mostrar bem:

✔ sua formação  
✔ cursos complementares  
✔ habilidades  
✔ projetos acadêmicos  
✔ objetivo profissional  
✔ disponibilidade  
✔ vontade de aprender  

O curso te ajuda a transformar isso em um currículo mais apresentável e mais alinhado com as vagas.`;
  }

  // =====================================================
  // 15. JÁ TENHO CURRÍCULO PRONTO
  // =====================================================
  if (hasAny(msg, ["ja tenho curriculo", "já tenho currículo", "curriculo pronto", "currículo pronto", "meu curriculo", "meu currículo", "ja fiz curriculo", "já fiz currículo"])) {
    return `Melhor ainda 😊

Se você já tem currículo, o curso pode te ajudar a melhorar o que já existe.

Muitas vezes o problema não é começar do zero, mas ajustar pontos como:

✔ excesso de informação  
✔ falta de palavras-chave  
✔ experiências mal descritas  
✔ objetivo muito genérico  
✔ layout confuso  
✔ informações que o sistema não lê bem  
✔ currículo igual para todas as vagas  

O curso te mostra como revisar com mais estratégia.`;
  }

  // =====================================================
  // 16. NÃO RECEBE RETORNO / NÃO CHAMAM
  // =====================================================
  if (hasAny(msg, ["nao chamam", "não chamam", "nao tenho retorno", "não tenho retorno", "mando curriculo", "mando currículo", "envio curriculo", "envio currículo", "ninguem chama", "ninguém chama", "nunca me chamam"])) {
    return `Entendo totalmente.

Isso é uma das situações mais comuns: a pessoa envia currículo para várias vagas e quase nunca recebe resposta.

Nem sempre isso significa que você não tem capacidade. Muitas vezes o currículo:

✔ não tem palavras-chave da vaga  
✔ está genérico demais  
✔ não mostra resultados  
✔ está desorganizado  
✔ não conversa com o cargo desejado  
✔ não passa bem pelos filtros automáticos  

O curso foi feito justamente para corrigir isso.`;
  }

  // =====================================================
  // 17. MUDANÇA DE ÁREA / TRANSIÇÃO
  // =====================================================
  if (hasAny(msg, ["mudar de area", "mudar de área", "transicao", "transição", "trocar de area", "trocar de área", "nova area", "nova área", "migrar de area", "migrar de área"])) {
    return `Serve muito para transição de área 😊

Nesse caso, o currículo precisa fazer uma ponte entre o que você já sabe e o que a nova vaga exige.

O segredo é valorizar:

✔ habilidades transferíveis  
✔ experiências que se conectam com a nova área  
✔ cursos recentes  
✔ projetos  
✔ objetivo claro  
✔ palavras-chave da nova função  

Se o currículo ficar focado só na área antiga, o recrutador pode não entender sua mudança.`;
  }

  // =====================================================
  // 18. TEMPO / DURAÇÃO
  // =====================================================
  if (hasAny(msg, ["quanto tempo", "duracao", "duração", "demora", "rapido", "rápido", "tempo de curso", "em quanto tempo"])) {
    return `O curso foi pensado para ser direto, prático e aplicável.

A ideia não é você passar semanas só vendo teoria. O foco é entender o que precisa mudar e aplicar no seu currículo.

Você pode assistir no seu ritmo e já começar a melhorar seu currículo conforme avança nas aulas.`;
  }

  // =====================================================
  // 19. CELULAR / COMPUTADOR
  // =====================================================
  if (hasAny(msg, ["celular", "computador", "notebook", "pc", "tablet", "assistir pelo celular", "da pra ver no celular", "dá pra ver no celular"])) {
    return `Você pode acessar pelo celular ou computador 😊

Para assistir às aulas, o celular já ajuda bastante.

Mas para editar o currículo com mais conforto, geralmente computador ou notebook facilita, porque você consegue mexer melhor em arquivo, texto, PDF, Word ou Canva.`;
  }

  // =====================================================
  // 20. CERTIFICADO
  // =====================================================
  if (hasAny(msg, ["certificado", "certificacao", "certificação", "tem certificado", "recebo certificado"])) {
    return `Boa pergunta 😊

O foco principal do curso é te ajudar a melhorar seu currículo na prática e aumentar suas chances de passar melhor pelas triagens.

Sobre certificado e detalhes específicos da emissão, o ideal é confirmar direto com a especialista Milene:

👉 ${linkMilene()}

Ela consegue te passar a informação mais certinha.`;
  }

  // =====================================================
  // 21. CONFIANÇA / SEGURANÇA / GOLPE
  // =====================================================
  if (hasAny(msg, ["confiavel", "confiável", "golpe", "seguro", "seguranca", "segurança", "e seguro", "é seguro", "posso confiar"])) {
    return `Entendo sua preocupação 😊

É normal querer confirmar antes de acessar qualquer curso.

O acesso é feito pela página oficial:

${linkCurso}

Lá você consegue ver as informações e seguir com o cadastro.

Se aparecer erro técnico ou problema de acesso, fale com o Gustavo:

👉 ${linkGustavo()}`;
  }

  // =====================================================
  // 22. CARO / SEM DINHEIRO / OBJEÇÃO FINANCEIRA
  // =====================================================
  if (hasAny(msg, ["caro", "sem dinheiro", "nao tenho dinheiro", "não tenho dinheiro", "to sem", "tô sem", "depois eu pago", "agora nao posso", "agora não posso"])) {
    return `Eu entendo de verdade.

Ninguém gosta de gastar sem ter certeza se vai ajudar.

Mas pensa por esse lado: se você está mandando currículo e não recebe retorno, pode estar perdendo oportunidades por causa de algo que dá para ajustar.

Um currículo melhor não garante emprego, mas pode aumentar suas chances de ser visto, chamado e avançar no processo.

Se quiser, eu posso te explicar melhor o que o curso entrega antes de você decidir.`;
  }

  // =====================================================
  // 23. VOU PENSAR / DEPOIS
  // =====================================================
  if (hasAny(msg, ["vou pensar", "depois", "mais tarde", "outro dia", "ver depois", "qualquer coisa", "vou ver", "preciso pensar"])) {
    return `Claro, sem problema 😊

É bom analisar com calma mesmo.

Só não deixa seu currículo parado por muito tempo se você já está buscando vaga, porque cada candidatura com um currículo mal ajustado pode ser uma oportunidade perdida.

Se surgir qualquer dúvida, pode chamar por aqui.`;
  }

  // =====================================================
  // 24. FUNCIONA MESMO / VALE A PENA
  // =====================================================
  if (hasAny(msg, ["funciona mesmo", "vale a pena", "da certo", "dá certo", "resultado", "garante emprego", "garantia de emprego", "vou conseguir emprego"])) {
    return `É importante ser transparente 😊

O curso não promete emprego garantido, porque isso depende de vaga, perfil, entrevista, mercado e outros fatores.

Mas ele te ajuda em uma parte muito importante: melhorar como seu currículo é lido por sistemas e recrutadores.

Se hoje você envia currículo e não recebe retorno, ajustar a estrutura, as palavras-chave e a forma de apresentar sua experiência pode fazer diferença.`;
  }

  // =====================================================
  // 25. QUER QUE FAÇA O CURRÍCULO
  // =====================================================
  if (hasAny(msg, ["faz meu curriculo", "faz meu currículo", "monta pra mim", "voce monta", "você monta", "fazer pra mim", "quero que faca", "quero que faça"])) {
    return `Entendi 😊

O curso foi pensado para te ensinar a montar e melhorar seu próprio currículo com estratégia.

Isso é importante porque você não fica preso a uma única versão. Você aprende a adaptar o currículo para várias vagas.

Mas se você quer uma orientação mais direta sobre o seu caso, a especialista Milene pode te orientar melhor sobre o caminho mais adequado.`;
  }

  // =====================================================
  // 26. LINKEDIN
  // =====================================================
  if (hasAny(msg, ["linkedin", "perfil linkedin", "perfil no linkedin"])) {
    return `O LinkedIn também é muito importante 😊

Mas o currículo ainda é essencial, principalmente quando você se candidata por plataformas como Gupy, Kenoby, InfoJobs, LinkedIn Jobs e sites de empresas.

O ideal é os dois estarem alinhados:

✔ currículo bem estruturado  
✔ LinkedIn com informações coerentes  
✔ palavras-chave da área  
✔ experiências bem explicadas  
✔ objetivo profissional claro`;
  }

  // =====================================================
  // 27. CANVA / WORD / PDF
  // =====================================================
  if (hasAny(msg, ["canva", "word", "pdf", "modelo", "template", "curriculo bonito", "currículo bonito"])) {
    return `Um currículo bonito ajuda, mas não é o mais importante.

O que mais pesa é se ele está claro, bem estruturado e fácil de ser lido por sistemas e recrutadores.

Às vezes um modelo muito visual no Canva pode até atrapalhar a leitura automática, dependendo de como foi feito.

O curso te mostra como pensar na estrutura antes da aparência.`;
  }

  // =====================================================
  // 28. CURRÍCULO EM PDF OU WORD
  // =====================================================
  if (hasAny(msg, ["pdf ou word", "word ou pdf", "formato", "qual formato", "enviar em pdf", "enviar em word"])) {
    return `Na maioria dos casos, PDF é uma boa opção porque preserva o formato.

Mas o mais importante é o currículo ser simples de ler, bem organizado e compatível com sistemas automáticos.

Evite excesso de imagens, tabelas confusas, colunas muito complexas ou elementos que dificultem a leitura.`;
  }

  // =====================================================
  // 29. PALAVRAS-CHAVE
  // =====================================================
  if (hasAny(msg, ["palavra chave", "palavras chave", "keywords", "termos da vaga"])) {
    return `Palavras-chave são uma parte muito importante do currículo.

Elas ajudam sistemas automáticos a entender se o seu perfil combina com a vaga.

Por exemplo, se a vaga pede “atendimento ao cliente”, “Excel”, “vendas”, “controle de estoque” ou “gestão de equipe”, essas informações precisam aparecer de forma natural se você realmente tem essas competências.

O curso ensina como usar palavras-chave sem parecer forçado e sem inventar experiência.`;
  }

  // =====================================================
  // 30. OBJETIVO PROFISSIONAL
  // =====================================================
  if (hasAny(msg, ["objetivo profissional", "objetivo no curriculo", "objetivo no currículo", "o que colocar no objetivo"])) {
    return `O objetivo profissional precisa ser claro e alinhado com a vaga.

Um erro comum é colocar frases muito genéricas, como “busco uma oportunidade para crescer”.

O ideal é mostrar a área ou cargo desejado de forma objetiva, sem exagerar.

Exemplo:  
“Busco oportunidade na área administrativa, com foco em organização de documentos, atendimento e apoio operacional.”

O curso ajuda a ajustar esse tipo de detalhe.`;
  }

  // =====================================================
  // 31. EXPERIÊNCIAS
  // =====================================================
  if (hasAny(msg, ["experiencia profissional", "experiência profissional", "como colocar experiencia", "como colocar experiência", "minhas experiencias", "minhas experiências"])) {
    return `A experiência precisa mostrar mais do que apenas o cargo.

O ideal é explicar o que você fazia, quais responsabilidades tinha e, se possível, algum resultado.

Exemplo simples:

Em vez de só colocar:
“Auxiliar administrativo”

Você pode melhorar para:
“Atendimento a clientes, organização de documentos, controle de planilhas e apoio às rotinas administrativas.”

Isso ajuda o recrutador e os sistemas a entenderem melhor seu perfil.

O curso aprofunda exatamente esse tipo de ajuste.`;
  }

  // =====================================================
  // 32. HABILIDADES
  // =====================================================
  if (hasAny(msg, ["habilidades", "competencias", "competências", "soft skills", "hard skills", "o que colocar em habilidades"])) {
    return `Na parte de habilidades, o ideal é colocar coisas que realmente tenham relação com a vaga.

Exemplos:

✔ Excel  
✔ atendimento ao cliente  
✔ organização  
✔ comunicação  
✔ vendas  
✔ liderança  
✔ controle de estoque  
✔ pacote Office  
✔ resolução de problemas  

O erro é colocar habilidades muito genéricas sem conexão com a oportunidade.

O curso te ajuda a escolher e posicionar melhor essas informações.`;
  }

  // =====================================================
  // 33. RECOLOCAÇÃO PROFISSIONAL
  // =====================================================
  if (hasAny(msg, ["recolocacao", "recolocação", "desempregado", "desempregada", "procurando emprego", "buscando emprego"])) {
    return `Entendo.

Para recolocação, o currículo precisa ser objetivo e estratégico.

O foco é mostrar rapidamente:

✔ o que você sabe fazer  
✔ onde já atuou  
✔ quais habilidades tem  
✔ que tipo de vaga busca  
✔ por que seu perfil combina com aquela oportunidade  

Se o currículo estiver muito genérico, pode acabar passando despercebido.`;
  }

  // =====================================================
  // 34. MUITA EXPERIÊNCIA / CURRÍCULO LONGO
  // =====================================================
  if (hasAny(msg, ["muita experiencia", "muita experiência", "curriculo longo", "currículo longo", "muitas empresas", "muitos empregos"])) {
    return `Quando a pessoa tem muita experiência, o desafio é organizar sem deixar o currículo pesado.

Nem tudo precisa entrar com o mesmo nível de detalhe.

O ideal é destacar o que mais conversa com a vaga atual e resumir experiências menos relevantes.

Um currículo muito longo pode cansar o recrutador e também dificultar a leitura.

O curso te ajuda a escolher o que valorizar e o que simplificar.`;
  }

  // =====================================================
  // 35. POUCA EXPERIÊNCIA
  // =====================================================
  if (hasAny(msg, ["pouca experiencia", "pouca experiência", "tenho pouca experiencia", "tenho pouca experiência"])) {
    return `Com pouca experiência, o currículo precisa valorizar melhor o que você já tem.

Você pode destacar:

✔ cursos  
✔ habilidades  
✔ atividades acadêmicas  
✔ projetos  
✔ experiências informais  
✔ atendimento, vendas, organização ou rotinas que já fez  
✔ vontade de aprender e área de interesse  

O segredo é não deixar o currículo vazio nem exagerar.`;
  }

  // =====================================================
  // 36. CURRÍCULO PARA VAGA ESPECÍFICA
  // =====================================================
  if (hasAny(msg, ["vaga especifica", "vaga específica", "adaptar curriculo", "adaptar currículo", "curriculo para vaga", "currículo para vaga"])) {
    return `Esse é um ponto muito importante.

O ideal é adaptar o currículo para cada tipo de vaga.

Não significa inventar informação. Significa destacar o que você já tem e que mais combina com aquela oportunidade.

Você pode ajustar:

✔ objetivo profissional  
✔ palavras-chave  
✔ ordem das experiências  
✔ habilidades em destaque  
✔ cursos mais relevantes  

O curso ensina exatamente essa lógica.`;
  }

  // =====================================================
  // 37. ÁREA ADMINISTRATIVA
  // =====================================================
  if (hasAny(msg, ["administrativo", "administrativa", "auxiliar administrativo", "assistente administrativo"])) {
    return `Para área administrativa, o currículo precisa destacar organização, atenção a detalhes e domínio de rotinas.

Pode valorizar:

✔ atendimento  
✔ planilhas  
✔ controle de documentos  
✔ emissão de relatórios  
✔ organização de arquivos  
✔ apoio a equipes  
✔ pacote Office  
✔ comunicação  

O curso ajuda a transformar essas experiências em descrições mais fortes e claras.`;
  }

  // =====================================================
  // 38. ÁREA DE VENDAS
  // =====================================================
  if (hasAny(msg, ["vendas", "vendedor", "vendedora", "comercial", "atendimento comercial"])) {
    return `Para vendas, o currículo precisa mostrar comunicação, atendimento e resultado.

Você pode destacar:

✔ atendimento ao cliente  
✔ negociação  
✔ prospecção  
✔ fechamento de vendas  
✔ metas  
✔ relacionamento com clientes  
✔ pós-venda  
✔ organização de carteira  

Mesmo que você não tenha números exatos, dá para descrever melhor suas responsabilidades.

O curso te ajuda a fazer isso com estratégia.`;
  }

  // =====================================================
  // 39. ATENDIMENTO AO CLIENTE
  // =====================================================
  if (hasAny(msg, ["atendimento", "cliente", "sac", "call center", "recepcao", "recepção"])) {
    return `Para atendimento ao cliente, é importante mostrar clareza, comunicação e resolução de problemas.

O currículo pode destacar:

✔ atendimento presencial ou online  
✔ suporte ao cliente  
✔ registro de solicitações  
✔ organização de informações  
✔ solução de dúvidas  
✔ trabalho em equipe  
✔ cordialidade e comunicação  

Muita gente coloca só “atendimento”, mas dá para deixar isso muito mais profissional.`;
  }

  // =====================================================
  // 40. TECNOLOGIA / TI
  // =====================================================
  if (hasAny(msg, ["ti", "tecnologia", "programacao", "programação", "desenvolvedor", "dev", "suporte tecnico", "suporte técnico"])) {
    return `Para área de tecnologia, o currículo precisa ser bem direto e mostrar ferramentas, projetos e habilidades técnicas.

É importante destacar:

✔ linguagens  
✔ ferramentas  
✔ projetos  
✔ GitHub ou portfólio, se tiver  
✔ experiências práticas  
✔ cursos  
✔ tecnologias usadas  

Também é importante adaptar o currículo para cada vaga, porque TI tem muitas áreas diferentes.`;
  }

  // =====================================================
  // 41. CURRÍCULO INTERNACIONAL / INGLÊS
  // =====================================================
  if (hasAny(msg, ["ingles", "inglês", "curriculo em ingles", "currículo em inglês", "vaga internacional", "exterior"])) {
    return `Currículo em inglês ou para vaga internacional precisa de cuidado.

Não é só traduzir palavra por palavra. É importante adaptar termos, formato e descrição das experiências.

Também é bom deixar claro:

✔ nível de inglês  
✔ experiências relevantes  
✔ ferramentas  
✔ resultados  
✔ formação  
✔ tipo de vaga buscada`;
  }

  // =====================================================
  // 42. IDADE / MAIS VELHO / RECOMEÇO
  // =====================================================
  if (hasAny(msg, ["tenho idade", "mais velho", "mais velha", "idade", "recomecar", "recomeçar", "voltar ao mercado"])) {
    return `Dá para montar um currículo estratégico em qualquer fase.

Quando a pessoa tem mais vivência, o segredo é destacar experiência, responsabilidade, maturidade e resultados, sem deixar o currículo pesado.

Também é importante adaptar a linguagem para o tipo de vaga que você quer agora.`;
  }

  // =====================================================
  // 43. PCD
  // =====================================================
  if (hasAny(msg, ["pcd", "deficiencia", "deficiência", "vaga pcd"])) {
    return `Para vagas PCD, também é importante ter um currículo bem estruturado.

O ideal é apresentar suas experiências, habilidades e formação com clareza, como em qualquer currículo, e mencionar informações relevantes apenas quando fizer sentido para a vaga ou processo.`;
  }

  // =====================================================
  // 44. NÃO SEI POR ONDE COMEÇAR
  // =====================================================
  if (hasAny(msg, ["nao sei por onde comecar", "não sei por onde começar", "estou perdido", "estou perdida", "to perdido", "tô perdido", "nao sei fazer curriculo", "não sei fazer currículo"])) {
    return `Tudo bem, isso é mais comum do que parece 😊

O primeiro passo é organizar as informações principais:

✔ dados de contato  
✔ objetivo profissional  
✔ experiências  
✔ formação  
✔ cursos  
✔ habilidades  
✔ informações que combinam com a vaga  

Depois disso, vem a parte estratégica: como escrever de um jeito que o recrutador e os sistemas entendam melhor.

O curso te guia nesse processo.`;
  }

  // =====================================================
  // 45. CURRÍCULO GENÉRICO
  // =====================================================
  if (hasAny(msg, ["curriculo generico", "currículo genérico", "muito generico", "muito genérico", "igual para todas as vagas"])) {
    return `Esse é um dos principais problemas.

Quando o currículo é muito genérico, ele não conversa diretamente com a vaga.

O ideal é adaptar algumas partes, como:

✔ objetivo  
✔ resumo profissional  
✔ habilidades  
✔ palavras-chave  
✔ experiências mais relevantes  

Assim o recrutador entende mais rápido por que você combina com aquela oportunidade.

O curso ensina como fazer isso sem precisar criar um currículo totalmente novo toda vez.`;
  }

  // =====================================================
  // 46. RESUMO PROFISSIONAL
  // =====================================================
  if (hasAny(msg, ["resumo profissional", "perfil profissional", "sobre mim no curriculo", "sobre mim no currículo"])) {
    return `O resumo profissional é uma das partes mais importantes do currículo.

Ele precisa mostrar rapidamente quem você é profissionalmente.

Um bom resumo pode trazer:

✔ área de atuação  
✔ tempo ou tipo de experiência  
✔ principais habilidades  
✔ foco profissional  
✔ pontos fortes ligados à vaga  

Evite frases muito vagas como “sou esforçado e comunicativo” sem contexto.

O curso ajuda a montar um resumo mais estratégico.`;
  }

  // =====================================================
  // 47. FOTO NO CURRÍCULO
  // =====================================================
  if (hasAny(msg, ["foto no curriculo", "foto no currículo", "colocar foto", "precisa de foto"])) {
    return `Na maioria dos casos, não precisa colocar foto no currículo, a menos que a vaga peça.

O mais importante é o conteúdo estar claro, profissional e bem organizado.

Foto pode ocupar espaço e nem sempre ajuda na análise.

É melhor usar esse espaço para mostrar habilidades, experiências e informações relevantes para a vaga.`;
  }

  // =====================================================
  // 48. ENDEREÇO / DADOS PESSOAIS
  // =====================================================
  if (hasAny(msg, ["endereco", "endereço", "dados pessoais", "cpf", "rg", "estado civil"])) {
    return `Cuidado com excesso de dados pessoais no currículo.

Geralmente não precisa colocar CPF, RG, nome dos pais ou informações muito pessoais.

O básico costuma ser:

✔ nome  
✔ telefone  
✔ e-mail  
✔ cidade/estado  
✔ LinkedIn, se tiver  

O currículo precisa ser profissional e objetivo.`;
  }

  // =====================================================
  // 49. CURSOS NO CURRÍCULO
  // =====================================================
  if (hasAny(msg, ["cursos no curriculo", "cursos no currículo", "curso complementar", "cursos complementares", "onde colocar curso"])) {
    return `Cursos podem fortalecer bastante o currículo, principalmente para quem tem pouca experiência ou está mudando de área.

O ideal é colocar cursos que tenham relação com a vaga desejada.

Exemplo:

✔ Excel para área administrativa  
✔ Atendimento ao cliente para comércio  
✔ Programação para tecnologia  
✔ Gestão de pessoas para liderança  

O curso te ajuda a organizar isso sem deixar o currículo poluído.`;
  }

  // =====================================================
  // 50. EMAIL PROFISSIONAL
  // =====================================================
  if (hasAny(msg, ["email", "e-mail", "email profissional", "e-mail profissional"])) {
    return `Um detalhe simples, mas importante: use um e-mail profissional.

Evite e-mails com apelidos, brincadeiras ou nomes muito informais.

O ideal é algo com nome e sobrenome, por exemplo:

nome.sobrenome@email.com

Pequenos detalhes também passam profissionalismo.`;
  }

  // =====================================================
  // 51. CURRÍCULO COM UMA PÁGINA
  // =====================================================
  if (hasAny(msg, ["uma pagina", "uma página", "duas paginas", "duas páginas", "quantas paginas", "quantas páginas"])) {
    return `Depende da sua experiência.

Para quem está começando, uma página geralmente é suficiente.

Para quem tem mais experiência, pode ter duas páginas, desde que tudo ali seja relevante.

O erro é colocar informação demais só para preencher espaço.

O currículo precisa ser claro, objetivo e estratégico.`;
  }

  // =====================================================
  // 52. ENTREVISTA
  // =====================================================
  if (hasAny(msg, ["entrevista", "chamado para entrevista", "chamada para entrevista", "me chamaram"])) {
    return `Que bom 😊

Se você foi chamado para entrevista, o currículo já cumpriu uma parte importante.

Agora é essencial você saber explicar suas experiências com clareza.

Revise:

✔ o que colocou no currículo  
✔ suas principais experiências  
✔ resultados que já teve  
✔ por que quer a vaga  
✔ como suas habilidades combinam com a oportunidade  

Um currículo bem feito também ajuda você a se preparar melhor para a entrevista.`;
  }

  // =====================================================
  // 53. MEDO / INSEGURANÇA
  // =====================================================
  if (hasAny(msg, ["tenho medo", "inseguro", "insegura", "vergonha", "nao sei se consigo", "não sei se consigo"])) {
    return `Eu entendo 😊

Muita gente se sente insegura na hora de montar currículo ou se candidatar.

Mas currículo não é sobre parecer perfeito. É sobre apresentar da melhor forma o que você já tem.

Com estrutura certa, até experiências simples podem ficar mais profissionais.`;
  }

  // =====================================================
  // 54. DESEMPENHO NO GUPY
  // =====================================================
  if (hasAny(msg, ["gupy nao chama", "gupy não chama", "gupy reprova", "gupy me reprova", "gupy nunca chama"])) {
    return `A Gupy e outras plataformas usam critérios e filtros que podem dificultar quando o currículo não está bem alinhado.

Alguns pontos que ajudam:

✔ usar palavras-chave da vaga  
✔ preencher o perfil com atenção  
✔ adaptar o currículo  
✔ evitar informações genéricas  
✔ manter experiências claras  
✔ revisar erros de português  

O curso te ajuda a entender essa lógica para não depender só da sorte.`;
  }

  // =====================================================
  // 55. ERROS DE PORTUGUÊS
  // =====================================================
  if (hasAny(msg, ["erro de portugues", "erro de português", "portugues", "português", "revisao", "revisão"])) {
    return `Erros de português podem prejudicar bastante a primeira impressão.

Antes de enviar, é bom revisar:

✔ acentuação  
✔ concordância  
✔ datas  
✔ nomes de cargos  
✔ excesso de abreviações  
✔ frases muito longas  

Um currículo limpo e bem escrito passa mais profissionalismo.

O curso também ajuda com organização e clareza na escrita.`;
  }

  // =====================================================
  // 56. NÃO TENHO CURSO
  // =====================================================
  if (hasAny(msg, ["nao tenho curso", "não tenho curso", "sem curso", "nunca fiz curso"])) {
    return `Mesmo sem muitos cursos, ainda dá para montar um currículo melhor.

Você pode destacar experiência prática, habilidades, atividades informais, projetos e disponibilidade para aprender.

Mas fazer cursos complementares pode ajudar bastante, principalmente se forem ligados à vaga desejada.

O importante é não deixar o currículo vazio ou genérico.`;
  }

  // =====================================================
  // 57. SÓ ENSINO MÉDIO
  // =====================================================
  if (hasAny(msg, ["ensino medio", "ensino médio", "só tenho ensino medio", "só tenho ensino médio", "terminei a escola"])) {
    return `Ter ensino médio não impede você de montar um bom currículo.

Você pode valorizar:

✔ formação  
✔ cursos livres  
✔ habilidades  
✔ experiências informais  
✔ atendimento  
✔ organização  
✔ disponibilidade  
✔ vontade de aprender  

O currículo precisa mostrar seu potencial de forma clara.`;
  }

  // =====================================================
  // 58. FACULDADE INCOMPLETA
  // =====================================================
  if (hasAny(msg, ["faculdade incompleta", "tranquei faculdade", "parei faculdade", "curso superior incompleto"])) {
    return `Faculdade incompleta pode entrar no currículo dependendo do caso.

Se tiver relação com a vaga ou mostrar uma formação relevante, pode ser útil mencionar.

O importante é apresentar de forma honesta e organizada, sem parecer informação solta.`;
  }

  // =====================================================
  // 59. MUITOS CURSOS
  // =====================================================
  if (hasAny(msg, ["muitos cursos", "tenho varios cursos", "tenho vários cursos", "qual curso colocar"])) {
    return `Quando você tem muitos cursos, o ideal é selecionar os mais relevantes.

Não precisa colocar tudo.

Priorize os cursos que têm relação com:

✔ a vaga desejada  
✔ sua área atual  
✔ sua transição de carreira  
✔ habilidades pedidas na descrição da vaga  

Currículo bom não é o que tem mais informação. É o que tem informação mais estratégica.`;
  }

  // =====================================================
  // 60. TRABALHO INFORMAL
  // =====================================================
  if (hasAny(msg, ["trabalho informal", "bico", "freelancer", "freela", "sem registro", "trabalhei sem carteira"])) {
    return `Experiência informal também pode ser valorizada, dependendo de como você apresenta.

Você pode colocar atividades como:

✔ atendimento  
✔ vendas  
✔ organização  
✔ entregas  
✔ cuidado com clientes  
✔ controle de pagamentos  
✔ produção de conteúdo  
✔ serviços autônomos  

O importante é escrever de forma profissional e verdadeira.

O curso ajuda bastante nesse tipo de organização.`;
  }

  // =====================================================
  // 61. DONA DE CASA / PAUSA NA CARREIRA
  // =====================================================
  if (hasAny(msg, ["dona de casa", "pausei carreira", "fiquei parada", "fiquei parado", "voltar a trabalhar", "voltar pro mercado"])) {
    return `Dá para voltar ao mercado com um currículo bem organizado.

Se houve uma pausa, o ideal é valorizar suas experiências anteriores, habilidades atuais, cursos e o tipo de vaga que você busca agora.

Também dá para destacar competências como organização, responsabilidade, rotina, atendimento, gestão de tarefas e adaptação, quando fizer sentido.`;
  }

  // =====================================================
  // 62. PORTFÓLIO
  // =====================================================
  if (hasAny(msg, ["portfolio", "portfólio", "github", "behance", "projetos"])) {
    return `Portfólio pode fortalecer muito o currículo, principalmente em áreas como tecnologia, design, marketing, redação, social media e áreas criativas.

Se você tem projetos, vale organizar e colocar um link profissional.

Mas o currículo ainda precisa explicar bem:

✔ o que você fez  
✔ quais ferramentas usou  
✔ qual foi seu papel  
✔ quais resultados ou aprendizados teve  

Currículo e portfólio precisam se complementar.`;
  }

  // =====================================================
  // 63. REDES SOCIAIS
  // =====================================================
  if (hasAny(msg, ["instagram", "redes sociais", "colocar instagram", "colocar rede social"])) {
    return `Só coloque redes sociais no currículo se elas forem profissionais ou relevantes para a vaga.

Por exemplo:

✔ LinkedIn  
✔ portfólio  
✔ GitHub  
✔ Behance  
✔ Instagram profissional, se for área criativa ou comercial  

Evite colocar redes pessoais que não ajudam na sua imagem profissional.`;
  }

  // =====================================================
  // 64. ÁREA DA SAÚDE
  // =====================================================
  if (hasAny(msg, ["saude", "saúde", "enfermagem", "cuidador", "cuidadora", "tecnico de enfermagem", "técnico de enfermagem"])) {
    return `Para área da saúde, o currículo precisa transmitir responsabilidade, cuidado e preparo técnico.

Pode destacar:

✔ formação  
✔ cursos obrigatórios  
✔ experiência com pacientes  
✔ atendimento humanizado  
✔ rotinas clínicas  
✔ organização  
✔ plantões  
✔ normas e procedimentos`;
  }

  // =====================================================
  // 65. LOGÍSTICA / ESTOQUE
  // =====================================================
  if (hasAny(msg, ["logistica", "logística", "estoque", "almoxarifado", "expedicao", "expedição", "conferente"])) {
    return `Para logística e estoque, o currículo pode destacar:

✔ controle de estoque  
✔ separação de pedidos  
✔ conferência  
✔ organização de mercadorias  
✔ entrada e saída de produtos  
✔ inventário  
✔ sistemas usados  
✔ agilidade e atenção a detalhes  

O curso ajuda a transformar essas atividades em descrições mais profissionais.`;
  }

  // =====================================================
  // 66. LIMPEZA / SERVIÇOS GERAIS
  // =====================================================
  if (hasAny(msg, ["limpeza", "servicos gerais", "serviços gerais", "auxiliar de limpeza", "diarista"])) {
    return `Para limpeza e serviços gerais, também dá para montar um currículo profissional.

Você pode destacar:

✔ organização  
✔ conservação de ambientes  
✔ atenção a detalhes  
✔ cumprimento de rotinas  
✔ responsabilidade  
✔ trabalho em equipe  
✔ pontualidade  
✔ experiência em empresas, casas, condomínios ou comércios  

Toda experiência pode ser valorizada quando é bem escrita.`;
  }

  // =====================================================
  // 67. PRODUÇÃO / INDÚSTRIA
  // =====================================================
  if (hasAny(msg, ["producao", "produção", "industria", "indústria", "operador de producao", "operador de produção", "fabrica", "fábrica"])) {
    return `Para produção e indústria, o currículo precisa mostrar rotina, responsabilidade e conhecimento operacional.

Pode destacar:

✔ linha de produção  
✔ operação de máquinas  
✔ controle de qualidade  
✔ embalagem  
✔ separação  
✔ organização  
✔ metas de produção  
✔ segurança no trabalho  

Se você já atuou na área, dá para deixar essa experiência mais forte no currículo.`;
  }

  // =====================================================
  // 68. MOTORISTA / ENTREGADOR
  // =====================================================
  if (hasAny(msg, ["motorista", "entregador", "entregas", "cnh", "habilitacao", "habilitação"])) {
    return `Para motorista ou entregador, o currículo pode destacar:

✔ categoria da CNH  
✔ experiência com rotas  
✔ entregas  
✔ atendimento ao cliente  
✔ pontualidade  
✔ conservação do veículo  
✔ conhecimento de regiões  
✔ aplicativos ou sistemas usados  

Essas informações ajudam o recrutador a entender melhor sua experiência.`;
  }

  // =====================================================
  // 69. ENTENDI / OK / CERTO
  // =====================================================
  if (hasAny(msg, ["entendi", "ok", "certo", "ta bom", "tá bom", "beleza", "blz"])) {
    return `Perfeito 😊

Se quiser, posso te ajudar a entender o próximo passo.

Você está mais interessado em:
1️⃣ melhorar um currículo que já tem  
2️⃣ montar um currículo do zero  
3️⃣ entender como passar pela IA/Gupy  
4️⃣ acessar o curso`;
  }

  // =====================================================
  // 70. SIM / QUERO / TENHO INTERESSE
  // =====================================================
  if (hasAny(msg, ["sim", "quero", "tenho interesse", "pode mandar", "manda", "me envie", "envia", "quero sim"])) {
    return `Perfeito 😊

Vou te passar o caminho:

1️⃣ Acesse a página do curso  
2️⃣ Faça seu cadastro  
3️⃣ Entre com seu login, se já tiver conta  
4️⃣ Siga para o pagamento  
5️⃣ Depois acesse a área do aluno  

Link:

${linkCurso}

Se der erro técnico, fale com Gustavo:

👉 ${linkGustavo()} 

Se houver qualquer outra dúvida podemos prosseguir por aqui mesmo, fico à sua disposição`;
  }

  // =====================================================
  // 71. NÃO / NÃO QUERO
  // =====================================================
  if (hasAny(msg, ["nao quero", "não quero", "nao tenho interesse", "não tenho interesse"])) {
    return `Tudo bem 😊

Sem problema nenhum.

Se sua dúvida for só sobre currículo, vaga ou como melhorar suas chances, posso tentar te orientar por aqui mesmo.`;
  }

  // =====================================================
  // 72. HUMANO / ATENDENTE / SUPORTE
  // =====================================================
  if (hasAny(msg, ["humano", "atendente", "falar com alguem", "falar com alguém", "pessoa", "suporte", "ajuda humana"])) {
    return `Claro 😊

Vou te direcionar certinho:

👩‍💼 Para dúvidas sobre currículo, curso, vagas ou orientação:
👉 Milene: ${linkMilene()}

👨‍💻 Para erro, login, acesso, pagamento travado, página com problema ou bug:
👉 Gustavo: ${linkGustavo()}

Assim você fala com a pessoa certa e resolve mais rápido.`;
  }

  // =====================================================
  // 73. OBRIGADO
  // =====================================================
  if (hasAny(msg, ["obrigado", "obrigada", "valeu", "vlw", "agradeco", "agradeço"])) {
    return `Imagina 😊

Fico feliz em ajudar.

Se surgir qualquer dúvida sobre currículo, vaga, curso ou acesso, pode chamar.`;
  }

  // =====================================================
  // 74. CLIENTE CONFUSO / MENSAGEM CURTA
  // =====================================================
  if (rawMsg.trim().length <= 3) {
    return `${saudacao}me fala um pouquinho melhor o que você precisa 😊

Você quer ajuda com currículo, acesso ao curso ou está com algum problema técnico?`;
  }

  // =====================================================
  // 75. RESPOSTA PADRÃO INTELIGENTE
  // =====================================================
  return `${saudacao}entendi 😊

Para eu te ajudar melhor, me conta um pouco mais sobre sua dúvida.

Se for sobre currículo, vaga, IA, Gupy, LinkedIn ou se o curso serve para o seu caso, posso tentar te orientar por aqui.

Se for erro, problema de acesso, login, pagamento travado ou página com falha, me avisa que eu te direciono para o suporte certo.`;

}

async function maybeGetClaudeReply(messageText, user) {
  const claudeKey = cleanEnv(process.env.CLAUDE_API_KEY);

  if (!claudeKey || claudeKey === "sua_chave_real") {
    return null;
  }

  try {
    const prompt = `
Você é um atendente comercial de WhatsApp.
Responda em português do Brasil, curto, natural e objetivo.
O cliente ainda não pagou o acesso.
Ajude a concluir a compra ou tirar dúvidas.
Evite mensagens longas.

Nome do cliente: ${user?.name || "Cliente"}
Mensagem do cliente: ${messageText}
    `.trim();

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": claudeKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: cleanEnv(process.env.CLAUDE_MODEL) || "claude-3-5-sonnet-20241022",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro Claude:", data);
      return null;
    }

    return data?.content?.[0]?.text?.trim() || null;
  } catch (error) {
    console.error("Erro ao consultar Claude:", error.message);
    return null;
  }
}

async function processPendingWhatsappMessages() {
  if (whatsappJobRunning) return;
  whatsappJobRunning = true;

  try {
    const users = await getPendingWhatsappUsers();

    for (const user of users) {
      try {
        const celularBanco = normalizePhoneBR(user.celular);
        const celular = getFinalTestPhone(user);

        console.log(`user_id ${user.id} | numero vindo do banco: ${user.celular}`);
        console.log(`user_id ${user.id} | numero normalizado do banco: ${celularBanco}`);
        console.log(`user_id ${user.id} | numero final para envio: ${celular}`);
        console.log(`user_id ${user.id} | phone_number_id usado: ${getWhatsAppConfig().phoneNumberId}`);

                if (!celular) continue;

        const mensagensTeste = [
          `Oi, tudo bem? 😊

Vi que você se interessou pelo curso… ficou alguma dúvida pra finalizar seu acesso?`,

          `Fala! 👀

Você chegou bem perto de garantir o acesso ao curso… quer que eu te ajude a finalizar?`,

          `Oi! 😊

Vi seu interesse aqui no curso. Posso te ajudar a liberar o acesso rapidinho?`
        ];

        const mensagemInicial = mensagensTeste[Math.floor(Math.random() * mensagensTeste.length)];

        const randomDelay = Math.floor(Math.random() * 2000) + 8000; // 8–10s

        await delay(randomDelay);

        const textResponse = await sendWhatsAppText(celular, mensagemInicial);

        await saveWhatsappMessage({
          userId: user.id,
          celular,
          direction: "out",
          messageText: mensagemInicial,
          waMessageId: textResponse?.messages?.[0]?.id || null,
          rawPayload: textResponse
        });

        await markWhatsappSent(user.id);

        console.log(`WhatsApp em texto enviado para user_id ${user.id} - ${celular}`);
      } catch (err) {
        console.error(`Erro ao enviar WhatsApp para user_id ${user.id}:`, err.message);
      }
    }
  } catch (error) {
    console.error("Erro na rotina de WhatsApp:", error.message);
  } finally {
    whatsappJobRunning = false;
  }
}

app.get("/api/inbox/conversations", async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        u.id,
        u.name,
        u.email,
        u.celular,
        u.access_released,
        u.whatsapp_sent,
        u.last_customer_message_at,
        u.last_bot_message_at,
        u.bot_paused,
        (
          SELECT message_text 
          FROM whatsapp_messages wm 
          WHERE wm.user_id = u.id 
          ORDER BY wm.created_at DESC 
          LIMIT 1
        ) AS last_message,
        (
          SELECT created_at 
          FROM whatsapp_messages wm 
          WHERE wm.user_id = u.id 
          ORDER BY wm.created_at DESC 
          LIMIT 1
        ) AS last_message_at
      FROM users u
      WHERE u.celular IS NOT NULL
        AND u.celular <> ''
      ORDER BY last_message_at DESC
    `);

    res.json({ success: true, conversations: rows });
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar conversas", details: error.message });
  }
});

app.get("/api/inbox/messages/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const [messages] = await pool.query(
      `
      SELECT id, user_id, celular, direction, message_text, created_at
      FROM whatsapp_messages
      WHERE user_id = ?
      ORDER BY created_at ASC
      `,
      [userId]
    );

    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar mensagens", details: error.message });
  }
});

app.post("/api/inbox/bot-status", async (req, res) => {
  try {
    const { userId, paused } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId é obrigatório" });
    }

    await pool.query(
      `
      UPDATE users
      SET bot_paused = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [paused ? 1 : 0, userId]
    );

    res.json({
      success: true,
      userId,
      bot_paused: paused ? 1 : 0
    });
  } catch (error) {
    res.status(500).json({
      error: "Erro ao alterar status do bot",
      details: error.message
    });
  }
});

app.post("/api/inbox/send", async (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!userId || !message) {
      return res.status(400).json({ error: "userId e message são obrigatórios" });
    }

    const [rows] = await pool.query(
      `
      SELECT id, name, celular
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const user = rows[0];
    const celular = normalizePhoneBR(user.celular);

    const response = await sendWhatsAppText(celular, message);

    await saveWhatsappMessage({
      userId: user.id,
      celular,
      direction: "out",
      messageText: message,
      waMessageId: response?.messages?.[0]?.id || null,
      rawPayload: response
    });

    await pool.query(
      `
      UPDATE users
      SET last_bot_message_at = NOW(),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      [user.id]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Erro ao enviar mensagem", details: error.message });
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      message: "Backend online e MySQL conectado"
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "Erro ao validar MySQL",
      details: error.message
    });
  }
});

app.get("/api/health/details", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      message: "Backend online, MySQL conectado e variáveis carregadas",
      env: getEnvStatus()
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "Erro ao validar ambiente",
      details: error.message,
      env: getEnvStatus()
    });
  }
});

app.get("/api/config", (_req, res) => {
  res.json({
    publicKey: cleanEnv(process.env.MERCADO_PAGO_PUBLIC_KEY) || ""
  });
});

app.post("/api/chat/start", async (req, res) => {
  try {
    const { nome, email, celular, mensagem } = req.body;

    if (!mensagem) {
      return res.status(400).json({ error: "Mensagem obrigatória" });
    }

    let user = null;

    if (email) {
      const [rows] = await pool.query(
        `
        SELECT id, name, email, celular, access_released
        FROM users
        WHERE email = ?
        LIMIT 1
        `,
        [email]
      );
      user = rows[0] || null;
    }

    const respostaClaude = await maybeGetClaudeReply(mensagem, user);

    const resposta =
      respostaClaude ||
      "Oi! Recebi sua mensagem. Posso te ajudar com pagamento, acesso ao curso ou dúvidas gerais.";

    return res.json({
      success: true,
      reply: resposta,
      user: user || { nome, email, celular }
    });
  } catch (error) {
    console.error("Erro /api/chat/start:", error);
    return res.status(500).json({
      error: "Erro ao iniciar chat",
      details: error.message
    });
  }
});

app.post("/api/users/register", async (req, res) => {
  try {
    const { name, email, password, celular, nascimento, area } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Nome, e-mail e senha são obrigatórios"
      });
    }

    const [existing] = await pool.query(
      `SELECT id FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        error: "Já existe uma conta com esse e-mail"
      });
    }

    const [result] = await pool.query(
      `INSERT INTO users (name, email, password_hash, celular, nascimento, area)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name,
        email,
        password,
        celular || null,
        nascimento || null,
        area || null
      ]
    );

    return res.status(201).json({
      success: true,
      user: {
        id: result.insertId,
        name,
        email,
        celular: celular || null,
        nascimento: nascimento || null,
        area: area || null,
        access_released: 0
      }
    });
  } catch (error) {
    console.error("Erro ao registrar usuário:", error);
    return res.status(500).json({
      error: "Erro ao registrar usuário",
      details: error.message
    });
  }
});

app.post("/api/users/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "E-mail e senha são obrigatórios"
      });
    }

    const [rows] = await pool.query(
      `SELECT id, name, email, password_hash, celular, nascimento, area, access_released
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "Nenhuma conta cadastrada encontrada"
      });
    }

    const user = rows[0];

    if (user.password_hash !== password) {
      return res.status(401).json({
        error: "E-mail ou senha inválidos."
      });
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        nome: user.name,
        email: user.email,
        celular: user.celular,
        nascimento: user.nascimento,
        area: user.area,
        access_released: user.access_released
      }
    });
  } catch (error) {
    console.error("Erro no login:", error);
    return res.status(500).json({
      error: "Erro ao fazer login",
      details: error.message
    });
  }
});

app.get("/api/users/access/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email);

    const [rows] = await pool.query(
      `SELECT id, name, email, celular, nascimento, area, access_released
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "Usuário não encontrado"
      });
    }

    return res.json({
      success: true,
      user: {
        id: rows[0].id,
        name: rows[0].name,
        email: rows[0].email,
        celular: rows[0].celular,
        nascimento: rows[0].nascimento,
        area: rows[0].area,
        access_released: rows[0].access_released
      }
    });
  } catch (error) {
    console.error("Erro ao consultar acesso do usuário:", error);
    return res.status(500).json({
      error: "Erro ao consultar acesso",
      details: error.message
    });
  }
});

app.post("/api/payments/pix", async (req, res) => {
  try {
    const { amount, description, payer } = req.body;

    if (!amount || !description || !payer?.email) {
      return res.status(400).json({
        error: "Campos obrigatórios: amount, description e payer.email"
      });
    }

    const user = await findOrCreateUser({
      name: `${payer.first_name || ""} ${payer.last_name || ""}`.trim(),
      email: payer.email
    });

    const webhookBaseUrl = cleanEnv(process.env.WEBHOOK_BASE_URL);
    const notificationUrl = webhookBaseUrl
      ? `${webhookBaseUrl}/api/webhooks/mercadopago`
      : undefined;

    const externalReference = `user_${user.id}`;

    const body = {
      transaction_amount: Number(amount),
      description,
      payment_method_id: "pix",
      external_reference: externalReference,
      payer: {
        email: payer.email,
        first_name: payer.first_name || "",
        last_name: payer.last_name || "",
        identification: payer.identification?.number
          ? {
              type: payer.identification.type || "CPF",
              number: sanitizeCpf(payer.identification.number)
            }
          : undefined
      },
      notification_url: notificationUrl
    };

    const result = await paymentClient.create({ body });
    const tx = result?.point_of_interaction?.transaction_data || {};

    const accessToken = await savePayment({
      userId: user.id,
      paymentId: result.id,
      paymentType: "pix",
      status: result.status,
      statusDetail: result.status_detail,
      amount: result.transaction_amount,
      description,
      payerEmail: payer.email,
      externalReference,
      rawResponse: result
    });

    return res.status(201).json({
      id: result.id,
      status: result.status,
      status_detail: result.status_detail,
      transaction_amount: result.transaction_amount,
      qr_code: tx.qr_code || null,
      qr_code_base64: tx.qr_code_base64 || null,
      ticket_url: tx.ticket_url || null,
      access_token: accessToken
    });
  } catch (error) {
    console.error("Erro PIX:", error);
    return res.status(500).json({
      error: "Erro ao criar pagamento PIX",
      details: error?.message || "Erro desconhecido"
    });
  }
});

app.post("/api/payments/card", async (req, res) => {
  try {
    const {
      amount,
      description,
      installments,
      payment_method_id,
      issuer_id,
      token,
      payer
    } = req.body;

    if (
      !amount ||
      !description ||
      !installments ||
      !payment_method_id ||
      !token ||
      !payer?.email
    ) {
      return res.status(400).json({
        error: "Campos obrigatórios: amount, description, installments, payment_method_id, token e payer.email"
      });
    }

    const user = await findOrCreateUser({
      name: `${payer.first_name || ""} ${payer.last_name || ""}`.trim(),
      email: payer.email
    });

    const webhookBaseUrl = cleanEnv(process.env.WEBHOOK_BASE_URL);
    const notificationUrl = webhookBaseUrl
      ? `${webhookBaseUrl}/api/webhooks/mercadopago`
      : undefined;

    const externalReference = `user_${user.id}`;

    const body = {
      transaction_amount: Number(amount),
      token,
      description,
      installments: Number(installments),
      payment_method_id,
      issuer_id: issuer_id || undefined,
      external_reference: externalReference,
      payer: {
        email: payer.email,
        identification: payer.identification?.number
          ? {
              type: payer.identification.type || "CPF",
              number: sanitizeCpf(payer.identification.number)
            }
          : undefined
      },
      notification_url: notificationUrl
    };

    const result = await paymentClient.create({ body });

    const accessToken = await savePayment({
      userId: user.id,
      paymentId: result.id,
      paymentType: "card",
      status: result.status,
      statusDetail: result.status_detail,
      amount: result.transaction_amount,
      description,
      payerEmail: payer.email,
      externalReference,
      rawResponse: result
    });

    if (result.status === "approved") {
      await markAccessReleased(result.id, payer.email);
    }

    return res.status(201).json({
      id: result.id,
      status: result.status,
      status_detail: result.status_detail,
      transaction_amount: result.transaction_amount,
      access_token: accessToken
    });
  } catch (error) {
    console.error("Erro cartão:", error);
    return res.status(500).json({
      error: "Erro ao criar pagamento com cartão",
      details: error?.message || "Erro desconhecido"
    });
  }
});

app.get("/api/payments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await paymentClient.get({ id });

    await pool.query(
      `
      UPDATE payments
      SET
        status = ?,
        status_detail = ?,
        transaction_amount = ?,
        raw_response = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE payment_id = ?
      `,
      [
        result.status,
        result.status_detail || null,
        Number(result.transaction_amount || 0),
        JSON.stringify(result),
        String(result.id)
      ]
    );

    if (result.status === "approved") {
      const payerEmail = result?.payer?.email || null;

      const externalReference = result?.external_reference || null;
      const userId = externalReference?.startsWith("user_")
        ? Number(externalReference.split("_")[1])
        : null;

      if (userId) {
        await pool.query(
          `
          UPDATE users
          SET access_released = 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
          `,
          [userId]
        );

        await pool.query(
          `
          UPDATE payments
          SET user_id = COALESCE(user_id, ?), updated_at = CURRENT_TIMESTAMP
          WHERE payment_id = ?
          `,
          [userId, String(result.id)]
        );
      } else if (payerEmail) {
        await markAccessReleased(result.id, payerEmail);
      }
    }

    return res.json({
      id: result.id,
      status: result.status,
      status_detail: result.status_detail,
      transaction_amount: result.transaction_amount,
      payment_method_id: result.payment_method_id
    });
  } catch (error) {
    console.error("Erro consulta:", error);
    return res.status(500).json({
      error: "Erro ao consultar pagamento",
      details: error?.message || "Erro desconhecido"
    });
  }
});

app.post("/api/webhooks/mercadopago", async (req, res) => {
  try {
    console.log("Webhook recebido:", JSON.stringify(req.body, null, 2));

    const topic = req.body?.type || req.body?.topic || null;
    const actionName = req.body?.action || null;
    const dataId = req.body?.data?.id || req.body?.id || null;

    await pool.query(
      `
      INSERT INTO payment_events (payment_id, event_type, action_name, raw_payload)
      VALUES (?, ?, ?, ?)
      `,
      [
        dataId ? String(dataId) : null,
        topic,
        actionName,
        JSON.stringify(req.body)
      ]
    );

    if (dataId) {
      const payment = await paymentClient.get({ id: String(dataId) });

      const [existingRows] = await pool.query(
        `
        SELECT user_id, payer_email, access_token
        FROM payments
        WHERE payment_id = ?
        LIMIT 1
        `,
        [String(payment.id)]
      );

      const existingPayment = existingRows[0] || null;

      const payerEmail =
        payment?.payer?.email ||
        existingPayment?.payer_email ||
        null;

      const externalReference = payment?.external_reference || null;
      const userIdFromReference = externalReference?.startsWith("user_")
        ? Number(externalReference.split("_")[1])
        : null;

      const userId = userIdFromReference || existingPayment?.user_id || null;

      if (!payerEmail) {
        console.log(
          `Webhook sem payer_email para payment ${payment.id}. Tentando seguir com external_reference/user_id.`
        );
      }

      if (!payerEmail && !userId) {
        console.log(
          `Webhook ignorado: sem payer_email e sem user_id para payment ${payment.id}`
        );
        return res.sendStatus(200);
      }

      await pool.query(
        `
        INSERT INTO payments (
          user_id,
          payment_id,
          payment_type,
          status,
          status_detail,
          transaction_amount,
          description,
          payer_email,
          external_reference,
          raw_response
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          user_id = VALUES(user_id),
          status = VALUES(status),
          status_detail = VALUES(status_detail),
          transaction_amount = VALUES(transaction_amount),
          description = VALUES(description),
          payer_email = VALUES(payer_email),
          external_reference = VALUES(external_reference),
          raw_response = VALUES(raw_response),
          updated_at = CURRENT_TIMESTAMP
        `,
        [
          userId,
          String(payment.id),
          payment.payment_method_id || "unknown",
          payment.status || "unknown",
          payment.status_detail || null,
          Number(payment.transaction_amount || 0),
          payment.description || null,
          payerEmail || "sem-email@temporario.local",
          externalReference || null,
          JSON.stringify(payment)
        ]
      );

      if (payment.status === "approved") {
        if (userId) {
          await pool.query(
            `
            UPDATE users
            SET access_released = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [userId]
          );

          await pool.query(
            `
            UPDATE payments
            SET status = 'approved', user_id = ?, updated_at = CURRENT_TIMESTAMP
            WHERE payment_id = ?
            `,
            [userId, String(payment.id)]
          );

          console.log(`Acesso liberado para user_id ${userId}`);
        } else if (payerEmail) {
          await markAccessReleased(payment.id, payerEmail);
          console.log(`Acesso liberado para email ${payerEmail}`);
        }
      }
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("Erro webhook:", error);
    return res.sendStatus(200);
  }
});

app.get("/api/webhooks/whatsapp", (req, res) => {
  try {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const wa = getWhatsAppConfig();

    console.log("Verificação webhook WhatsApp recebida:", {
      mode,
      tokenRecebido: token || null,
      tokenEsperadoConfigurado: Boolean(wa.verifyToken)
    });

    if (mode === "subscribe" && token === wa.verifyToken) {
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  } catch (error) {
    console.error("Erro verificação webhook WhatsApp:", error);
    return res.sendStatus(500);
  }
});

app.post("/api/webhooks/whatsapp", async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    console.log("Webhook WhatsApp payload recebido.");

    const message = value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const from = normalizePhoneBR(message.from || "");
    const text = message?.text?.body || "";

    const user = await getUserByPhone(from);

    await saveWhatsappMessage({
      userId: user?.id || null,
      celular: from,
      direction: "in",
      messageText: text,
      waMessageId: message.id || null,
      rawPayload: req.body
    });

    if (user?.bot_paused) {
  if (user?.id) {
    await pool.query(`
      UPDATE users
      SET last_whatsapp_message_at = NOW(),
          last_customer_message_at = NOW(),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [user.id]);
  }

  console.log(`⏸️ Bot pausado para user ${user?.id}`);
  return res.sendStatus(200);
}

    if (user?.id) {
      await pool.query(
        `
        UPDATE users
        SET last_whatsapp_message_at = NOW(),
            last_customer_message_at = NOW(),
            whatsapp_followup_finished = 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [user.id]
      );
    }

let reply = buildCustomerReply(text, user);

// fallback inteligente com IA
if (!reply) {
  const claudeReply = await maybeGetClaudeReply(text, user);

  if (claudeReply) {
    reply = claudeReply;
  } else {
    reply = "Posso te ajudar com pagamento, acesso ou dúvidas do curso 😊";
  }
}
    const sendResponse = await sendWhatsAppText(from, reply);

    await saveWhatsappMessage({
      userId: user?.id || null,
      celular: from,
      direction: "out",
      messageText: reply,
      waMessageId: sendResponse?.messages?.[0]?.id || null,
      rawPayload: sendResponse
    });

    return res.sendStatus(200);
  } catch (error) {
    console.error("Erro webhook WhatsApp:", error);
    return res.sendStatus(200);
  }
});

const FOLLOWUP_INTERVAL_MINUTES = 5;
const MAX_FOLLOWUPS = 3;

function getFollowupMessage(followupCount) {
  const linkCurso = "https://gustavosales2001.github.io/Cursos_Love/";
  const contatoHumano = "11933128628";

  const mensagens = [
    `Oi 😊 passando só pra saber se ficou alguma dúvida sobre o curso ou sobre o acesso com desconto.`,

    `Vi que você ainda não finalizou. Quer que eu te explique rapidinho como funciona o cadastro e pagamento?`,

    `Última mensagem por aqui 😊

Se quiser garantir o acesso com desconto, é só entrar no link:

${linkCurso}

Se preferir falar direto comigo, chama aqui:

https://wa.me/55${contatoHumano}`
  ];

  return mensagens[followupCount] || null;
}

async function getUsersForWhatsappFollowUp() {
  const [rows] = await pool.query(
    `
    SELECT id, name, celular, whatsapp_followup_count
    FROM users
      WHERE id >= 100
      AND access_released = 0
      AND whatsapp_sent = 1
      AND whatsapp_opt_in = 1
      AND bot_paused = 0
      AND whatsapp_followup_finished = 0
      AND whatsapp_followup_count < ?
      AND celular IS NOT NULL
      AND celular <> ''
      AND last_bot_message_at <= NOW() - INTERVAL ? MINUTE
      AND NOT EXISTS (
        SELECT 1
        FROM whatsapp_messages wm
        WHERE wm.user_id = users.id
          AND wm.direction = 'in'
          AND wm.created_at >= users.whatsapp_sent_at
      )
    `,
    [MAX_FOLLOWUPS, FOLLOWUP_INTERVAL_MINUTES]
  );

  return rows;
}

async function processWhatsappFollowUps() {
  try {
    const users = await getUsersForWhatsappFollowUp();

    for (const user of users) {
      try {
        const celular = getFinalTestPhone(user);
        if (!celular) continue;

        const followupCount = Number(user.whatsapp_followup_count || 0);
        const message = getFollowupMessage(followupCount);

        if (!message) continue;

        const sendResponse = await sendWhatsAppText(celular, message);

        await saveWhatsappMessage({
          userId: user.id,
          celular,
          direction: "out",
          messageText: message,
          waMessageId: sendResponse?.messages?.[0]?.id || null,
          rawPayload: sendResponse
        });

        const nextCount = followupCount + 1;

        await pool.query(
          `
          UPDATE users
          SET whatsapp_followup_count = ?,
              whatsapp_followup_finished = ?,
              last_bot_message_at = NOW(),
              last_whatsapp_message_at = NOW(),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
          `,
          [
            nextCount,
            nextCount >= MAX_FOLLOWUPS ? 1 : 0,
            user.id
          ]
        );

        console.log(`Follow-up ${nextCount} enviado para user_id ${user.id} - ${celular}`);
      } catch (error) {
        console.error(`Erro no follow-up para user_id ${user.id}:`, error.message);
      }
    }
  } catch (error) {
    console.error("Erro geral no processo de follow-up:", error.message);
  }
}

async function start() {
  try {
    await initDB();
    await ensureTables();

    app.listen(port, () => {
      console.log(`Servidor rodando na porta ${port}`);
    });

    setInterval(() => {
      processPendingWhatsappMessages();
    }, 60 * 1000);

    setInterval(() => {
      processWhatsappFollowUps();
    }, 60 * 1000);

    processPendingWhatsappMessages();
    processWhatsappFollowUps();
  } catch (error) {
    console.error("Erro ao iniciar servidor:", error);
    process.exit(1);
  }
}

start();