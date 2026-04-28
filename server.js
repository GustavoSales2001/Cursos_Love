import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import crypto from "crypto";
import { MercadoPagoConfig, Payment } from "mercadopago";

dotenv.config();

const app = express();
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
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origem não permitida pelo CORS."));
    },
    methods: ["GET", "POST"],
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
const TEST_ONLY_USER_IDS = [7, 125];

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
    SELECT id, name, email, celular, access_released, whatsapp_sent
    FROM users
    WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(celular, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') = ?
    LIMIT 1
    `,
    [normalized]
  );

  return rows[0] || null;
}

async function getPendingWhatsappUsers() {
  const [rows] = await pool.query(
    `
    SELECT id, name, celular
    FROM users
    WHERE id IN (?, ?)
      AND access_released = 0
      AND whatsapp_sent = 0
      AND whatsapp_opt_in = 1
      AND celular IS NOT NULL
      AND celular <> ''
      AND created_at <= NOW() - INTERVAL 3 MINUTE
    `,
    TEST_ONLY_USER_IDS
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

function hasAny(msg, words = []) {
  return words.some((word) => msg.includes(word));
}

function buildCustomerReply(text = "", user = null) {
  const msg = String(text || "").toLowerCase();

  const linkCurso = "https://gustavosales2001.github.io/Cursos_Love/";
  const contatoHumano = "11933128628";
  const nome = user?.name ? user.name.split(" ")[0] : "";

  const saudacao = nome ? `${nome}, ` : "";

  // 1. PAGAMENTO / PIX / CARTÃO
  if (hasAny(msg, ["pagamento", "pagar", "pix", "cartão", "cartao", "boleto", "mercado pago"])) {
    return `${saudacao}o pagamento é feito pela página do curso 😊

Você acessa por aqui:

${linkCurso}

Depois é só fazer o cadastro ou entrar com seu login e seguir para a tela de pagamento.

Se aparecer algum erro, me manda o print que eu te ajudo a resolver.`;
  }

  // 2. PREÇO / VALOR
  if (hasAny(msg, ["preço", "valor", "quanto", "custa", "custo"])) {
    return `O curso está com condição especial pelo link com desconto 👇

${linkCurso}

A ideia é ser um acesso acessível pra quem quer melhorar o currículo e aumentar as chances em processos seletivos.`;
  }

  // 3. LINK / COMPRAR / DESCONTO
  if (hasAny(msg, ["link", "comprar", "desconto", "promoção", "promocao", "cupom"])) {
    return `Perfeito 😊

Aqui está o link com desconto:

${linkCurso}

Faça seu cadastro. Se já tiver conta, entre com seu login e finalize o pagamento por lá.`;
  }

  // 4. QUER SABER MAIS SOBRE O CURSO
  if (hasAny(msg, ["saber mais", "mais informações", "mais informacoes", "me explica", "explica", "como funciona", "funciona"])) {
    return `Claro 😊

O curso “Currículo que Vence a IA” ensina você a montar um currículo mais estratégico para passar melhor pelos filtros automáticos das empresas.

Você aprende:

✔ Como a IA/ATS lê seu currículo  
✔ Como organizar as informações do jeito certo  
✔ Como usar palavras-chave sem parecer artificial  
✔ Como adaptar o currículo para cada vaga  
✔ Como evitar erros que fazem o currículo ser ignorado  

Quer que eu te mande o link com desconto?`;
  }

  // 5. ATS / IA / GUPY / LINKEDIN
  if (hasAny(msg, ["ia", "ats", "gupy", "linkedin", "filtro", "robô", "robo", "automático", "automatico"])) {
    return `Boa pergunta 👀

Hoje muitas empresas usam sistemas automáticos para filtrar currículos antes do recrutador ver.

Esses sistemas procuram:

✔ palavras-chave da vaga  
✔ cargos e experiências compatíveis  
✔ organização clara  
✔ informações fáceis de identificar  

O curso te mostra como estruturar o currículo para não perder força nessa primeira triagem.

Quer acessar com desconto?`;
  }

  // 6. MÓDULOS / AULAS / CONTEÚDO
  if (hasAny(msg, ["módulo", "modulo", "módulos", "modulos", "aula", "aulas", "conteúdo", "conteudo", "material", "materiais"])) {
    return `O curso é dividido em módulos bem práticos:

1️⃣ Como a IA lê seu currículo  
2️⃣ Estrutura que chama atenção  
3️⃣ Palavras-chave certas  
4️⃣ Currículo final estratégico  

Também tem materiais de apoio, como checklist, modelo base e PDFs dos módulos.

Quer que eu te mande o link com desconto?`;
  }

  // 7. PRIMEIRO EMPREGO / SEM EXPERIÊNCIA
  if (hasAny(msg, ["primeiro emprego", "sem experiência", "sem experiencia", "nunca trabalhei", "não tenho experiência", "nao tenho experiencia"])) {
    return `Serve sim 😊

Mesmo sem experiência formal, você pode montar um currículo mais forte destacando:

✔ formação  
✔ cursos  
✔ habilidades  
✔ projetos  
✔ experiências informais  
✔ objetivo profissional  

O curso te ajuda a organizar tudo isso de forma mais estratégica.

Quer acessar com desconto?`;
  }

  // 8. ESTÁGIO / JOVEM APRENDIZ
  if (hasAny(msg, ["estágio", "estagio", "jovem aprendiz", "aprendiz", "faculdade"])) {
    return `Serve muito para estágio e jovem aprendiz 😊

Nesses casos, o currículo precisa mostrar potencial, organização e clareza, mesmo sem muita experiência.

O curso ajuda você a montar uma estrutura mais profissional e alinhada com as vagas.

Quer o link com desconto?`;
  }

  // 9. JÁ TENHO CURRÍCULO
  if (hasAny(msg, ["já tenho currículo", "ja tenho curriculo", "currículo pronto", "curriculo pronto", "meu currículo", "meu curriculo"])) {
    return `Melhor ainda 😊

Se você já tem currículo, o curso te ajuda a revisar e melhorar o que já existe.

Você vai conseguir identificar:

✔ erros de estrutura  
✔ falta de palavras-chave  
✔ informações genéricas  
✔ pontos que podem ser valorizados melhor  
✔ ajustes para passar melhor pelos filtros  

Quer acessar com desconto?`;
  }

  // 10. NÃO CONSIGO VAGA / NÃO CHAMAM
  if (hasAny(msg, ["não consigo emprego", "nao consigo emprego", "não chamam", "nao chamam", "não tenho retorno", "nao tenho retorno", "mando currículo", "mando curriculo"])) {
    return `Entendo totalmente.

Muitas vezes o problema não é falta de capacidade, mas a forma como o currículo está sendo apresentado.

Se ele estiver confuso, genérico ou sem palavras-chave, pode ser ignorado antes mesmo de chegar no recrutador.

O curso foi feito justamente para corrigir isso.

Quer que eu te mande o acesso com desconto?`;
  }

  // 11. MUDANÇA DE ÁREA
  if (hasAny(msg, ["mudar de área", "mudar de area", "transição", "transicao", "trocar de área", "trocar de area"])) {
    return `Serve muito bem para isso 😊

Na transição de área, o currículo precisa mostrar suas habilidades de forma estratégica e conectar sua experiência anterior com a vaga desejada.

O curso te ensina a adaptar o currículo para oportunidades diferentes sem parecer forçado.

Quer acessar com desconto?`;
  }

  // 12. TEMPO / DURAÇÃO
  if (hasAny(msg, ["quanto tempo", "duração", "duracao", "demora", "rápido", "rapido"])) {
    return `O curso foi pensado para ser direto e prático 😊

Você pode assistir no seu ritmo e já aplicar melhorias no currículo desde as primeiras aulas.

A ideia não é enrolar com teoria, é ajudar você a ajustar seu currículo de forma estratégica.

Quer receber o link com desconto?`;
  }

  // 13. CELULAR / COMPUTADOR
  if (hasAny(msg, ["celular", "computador", "notebook", "pc"])) {
    return `Você pode acessar pelo celular ou computador 😊

Para assistir às aulas, o celular já resolve.

Mas para editar o currículo com mais facilidade, o computador ou notebook costuma ser melhor.

Quer o link de acesso com desconto?`;
  }

  // 14. CERTIFICADO
  if (hasAny(msg, ["certificado", "certificação", "certificacao"])) {
    return `Boa pergunta 😊

O foco principal do curso é te ajudar a melhorar seu currículo na prática.

Sobre certificado, recomendo verificar na própria página do curso ou falar direto comigo por aqui:

https://wa.me/55${contatoHumano}`;
  }

  // 15. GARANTIA / CONFIANÇA / GOLPE
  if (hasAny(msg, ["é confiável", "e confiavel", "confiável", "confiavel", "golpe", "seguro", "segurança", "seguranca"])) {
    return `Entendo sua dúvida 😊

O acesso é feito pela página oficial do curso, com cadastro e área do aluno.

Lá dentro você encontra os módulos, aulas e materiais de apoio.

Pode acessar por aqui:

${linkCurso}

Se tiver qualquer dificuldade, me manda print que eu te ajudo.`;
  }

  // 16. OBJEÇÃO: CARO / SEM DINHEIRO
  if (hasAny(msg, ["caro", "sem dinheiro", "não tenho dinheiro", "nao tenho dinheiro", "depois eu pago", "tô sem", "to sem"])) {
    return `Eu te entendo.

Mas pensa comigo: se o currículo estiver fraco ou mal estruturado, você pode continuar perdendo oportunidades sem saber o motivo.

O curso é justamente para te ajudar a corrigir isso e se posicionar melhor nas vagas.

Posso te mandar o link com desconto para você analisar com calma?`;
  }

  // 17. VOU PENSAR / DEPOIS
  if (hasAny(msg, ["vou pensar", "depois", "mais tarde", "outro dia", "qualquer coisa", "ver depois"])) {
    return `Claro, sem problema 😊

Só não deixa parado por muito tempo, porque cada vaga enviada com um currículo mal ajustado pode ser uma oportunidade perdida.

Vou deixar o link aqui caso queira ver com calma:

${linkCurso}`;
  }

  // 18. FUNCIONA MESMO / VALE A PENA
  if (hasAny(msg, ["funciona mesmo", "vale a pena", "dá certo", "da certo", "resultado", "garante emprego", "garantia de emprego"])) {
    return `Vale principalmente se você manda currículo e quase não recebe retorno.

O curso não promete emprego garantido, mas te ensina a melhorar algo essencial: como seu currículo é lido por sistemas e recrutadores.

Isso pode aumentar suas chances de avançar nos processos.

Quer acessar com desconto?`;
  }

  // 19. QUER QUE FAÇA O CURRÍCULO
  if (hasAny(msg, ["faz meu currículo", "faz meu curriculo", "monta pra mim", "você monta", "voce monta", "fazer pra mim"])) {
    return `Eu posso te orientar 😊

Mas o curso foi feito para você aprender a montar e melhorar seu próprio currículo com estratégia.

Assim você consegue adaptar para várias vagas, não depender de uma única versão.

Quer que eu te mande o acesso com desconto?`;
  }

  // 20. ACESSO / LOGIN / CADASTRO
  if (hasAny(msg, ["cadastro", "login", "entrar", "acesso", "senha", "área do aluno", "area do aluno"])) {
    return `É simples 😊

Acesse:

${linkCurso}

Se ainda não tiver conta, faça o cadastro.

Se já tiver conta, entre com seu login e siga para o pagamento/liberação do acesso.

Se travar em alguma parte, me manda print que eu te ajudo.`;
  }

  // 21. CLIENTE DISSE SIM / QUERO
  if (hasAny(msg, ["sim", "quero", "manda", "pode mandar", "tenho interesse", "me envie", "envia"])) {
    return `Perfeito 🔥

Aqui está o link com desconto:

${linkCurso}

👉 Faça o cadastro  
👉 Entre com seu login se já tiver conta  
👉 Finalize o pagamento  
👉 Depois o acesso é liberado na área do aluno`;
  }

  // 22. OBRIGADO
  if (hasAny(msg, ["obrigado", "obrigada", "valeu", "vlw"])) {
    return `Imagina 😊

Se quiser garantir o acesso com desconto, é só entrar por aqui:

${linkCurso}`;
  }

  // 23. HUMANO
  if (hasAny(msg, ["humano", "atendente", "falar com alguém", "falar com alguem", "suporte", "ajuda humana"])) {
    return `Claro 😊

Se preferir falar direto comigo, chama nesse WhatsApp:

https://wa.me/55${contatoHumano}`;
  }

  // RESPOSTA PADRÃO
 return null;
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
    WHERE id IN (?, ?)
      AND access_released = 0
      AND whatsapp_sent = 1
      AND whatsapp_opt_in = 1
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
    [...TEST_ONLY_USER_IDS, MAX_FOLLOWUPS, FOLLOWUP_INTERVAL_MINUTES]
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