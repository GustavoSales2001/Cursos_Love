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

app.get("/api/config", (_req, res) => {
  res.json({
    publicKey: process.env.MERCADO_PAGO_PUBLIC_KEY || ""
  });
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

async function start() {
  try {
    await initDB();
    await ensureTables();

    app.listen(port, () => {
      console.log(`Servidor rodando na porta ${port}`);
    });
  } catch (error) {
    console.error("Erro ao iniciar servidor:", error);
    process.exit(1);
  }
}

start();