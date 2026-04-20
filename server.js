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

const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((v) => v.trim())
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

if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
  throw new Error("Defina MERCADO_PAGO_ACCESS_TOKEN no .env");
}

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
  options: { timeout: 5000 }
});

const paymentClient = new Payment(client);

let pool;
let whatsappJobRunning = false;

/* TESTE: envia apenas para um usuário específico */
const TEST_ONLY_USER_ID = 7;

/*
  CORREÇÃO DO ERRO DO WHATSAPP:
  antes o código sobrescrevia o número do user_id 7 para 5511933128628.
  isso fazia o backend ignorar o número vindo do banco e enviar para um número
  diferente do autorizado no Meta.

  agora a função abaixo vai usar SOMENTE o número salvo no banco.
*/

async function initDB() {
  pool = mysql.createPool({
    host: process.env.MYSQLHOST,
    port: Number(process.env.MYSQLPORT || 3306),
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  console.log("MYSQLHOST:", process.env.MYSQLHOST);
  console.log("MYSQLPORT:", process.env.MYSQLPORT);
  console.log("MYSQLUSER:", process.env.MYSQLUSER);
  console.log("MYSQL_DATABASE:", process.env.MYSQL_DATABASE);

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

/* CORREÇÃO AQUI: agora usa apenas o número do banco, sem override */
function getFinalTestPhone(user) {
  return normalizePhoneBR(user.celular);
}

/* INCLUSÃO: diagnóstico seguro de ambiente */
function getEnvStatus() {
  return {
    node_env: process.env.NODE_ENV || null,
    port: port || null,
    frontend_url_configured: Boolean(process.env.FRONTEND_URL),
    mysql: {
      host: process.env.MYSQLHOST || null,
      port: process.env.MYSQLPORT || null,
      user: process.env.MYSQLUSER || null,
      database: process.env.MYSQL_DATABASE || null,
      password_configured: Boolean(process.env.MYSQLPASSWORD)
    },
    mercado_pago: {
      access_token_configured: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN),
      public_key_configured: Boolean(process.env.MERCADO_PAGO_PUBLIC_KEY),
      webhook_base_url: process.env.WEBHOOK_BASE_URL || null
    },
    whatsapp: {
      token_configured: Boolean(process.env.WHATSAPP_TOKEN),
      phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
      verify_token_configured: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
      verify_token_preview: process.env.WHATSAPP_VERIFY_TOKEN
        ? `${String(process.env.WHATSAPP_VERIFY_TOKEN).slice(0, 6)}...`
        : null,
      template_name: process.env.WHATSAPP_TEMPLATE_NAME || null
    },
    claude: {
      api_key_configured: Boolean(process.env.CLAUDE_API_KEY),
      model: process.env.CLAUDE_MODEL || null
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
  const url = `https://graph.facebook.com/v23.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
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
    throw new Error(data?.error?.message || "Erro ao enviar WhatsApp");
  }

  return data;
}

async function sendWhatsAppTemplate(to, templateName = "hello_world") {
  const url = `https://graph.facebook.com/v23.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en_US" }
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
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
    WHERE id = ?
      AND access_released = 0
      AND whatsapp_sent = 0
      AND whatsapp_opt_in = 1
      AND celular IS NOT NULL
      AND celular <> ''
      AND created_at <= NOW() - INTERVAL 30 MINUTE
    LIMIT 1
    `,
    [TEST_ONLY_USER_ID]
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
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
    [userId]
  );
}

async function maybeGetClaudeReply(messageText, user) {
  if (!process.env.CLAUDE_API_KEY) {
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
        "x-api-key": process.env.CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || "claude-3-5-sonnet-20241022",
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
        console.log(`user_id ${user.id} | phone_number_id usado: ${process.env.WHATSAPP_PHONE_NUMBER_ID}`);

        if (!celular) continue;

        const templateResponse = await sendWhatsAppTemplate(
          celular,
          process.env.WHATSAPP_TEMPLATE_NAME || "hello_world"
        );

        await saveWhatsappMessage({
          userId: user.id,
          celular,
          direction: "out",
          messageText: "Template inicial enviado no WhatsApp.",
          waMessageId: templateResponse?.messages?.[0]?.id || null,
          rawPayload: templateResponse
        });

        await markWhatsappSent(user.id);

        console.log(`WhatsApp enviado para user_id ${user.id} - ${celular}`);
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

/* INCLUSÃO: rota para validar ambiente sem expor segredos */
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
    publicKey: process.env.MERCADO_PAGO_PUBLIC_KEY || ""
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

    const notificationUrl = process.env.WEBHOOK_BASE_URL
      ? `${process.env.WEBHOOK_BASE_URL}/api/webhooks/mercadopago`
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

    const notificationUrl = process.env.WEBHOOK_BASE_URL
      ? `${process.env.WEBHOOK_BASE_URL}/api/webhooks/mercadopago`
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

app.get("/api/payments/access/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;

    const [rows] = await pool.query(
      `
      SELECT
        p.payment_id,
        p.status,
        p.status_detail,
        p.access_token,
        p.payer_email,
        u.access_released
      FROM payments p
      LEFT JOIN users u ON u.id = p.user_id
      WHERE p.payment_id = ?
      LIMIT 1
      `,
      [String(paymentId)]
    );

    if (!rows.length) {
      return res.status(404).json({
        error: "Pagamento não encontrado"
      });
    }

    return res.json({
      success: true,
      payment: rows[0]
    });
  } catch (error) {
    console.error("Erro ao consultar liberação:", error);
    return res.status(500).json({
      error: "Erro ao consultar liberação",
      details: error.message
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

    console.log("Verificação webhook WhatsApp recebida:", {
      mode,
      tokenRecebido: token || null,
      tokenEsperadoConfigurado: Boolean(process.env.WHATSAPP_VERIFY_TOKEN)
    });

    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
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
        SET last_whatsapp_message_at = NOW(), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [user.id]
      );
    }

    let reply =
      "Oi! Vi sua mensagem 😊 Se quiser, posso te ajudar a finalizar seu acesso agora.";

    const claudeReply = await maybeGetClaudeReply(text, user);
    if (claudeReply) {
      reply = claudeReply;
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

    processPendingWhatsappMessages();
  } catch (error) {
    console.error("Erro ao iniciar servidor:", error);
    process.exit(1);
  }
}

start();