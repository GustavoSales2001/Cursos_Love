const radios = document.querySelectorAll('input[name="pagamento"]');
const paymentInfo = document.getElementById("paymentInfo");
const paymentOptions = document.querySelectorAll(".payment-option");

const API_BASE_URL = "https://SEU-APP.up.railway.app/api";

let pagamentoAtualId = null;
let ultimoPixCode = null;

radios.forEach(radio => {
  radio.addEventListener("change", atualizarPagamento);
});

function atualizarEstiloOpcao() {
  paymentOptions.forEach(option => option.classList.remove("selected-option"));

  const selecionado = document.querySelector('input[name="pagamento"]:checked');
  if (selecionado) {
    selecionado.closest(".payment-option").classList.add("selected-option");
  }
}

function getUsuario() {
  return JSON.parse(localStorage.getItem("usuario")) || {};
}

function getPrimeiroNome(nomeCompleto = "") {
  return nomeCompleto.trim().split(" ")[0] || "Cliente";
}

async function atualizarPagamento() {
  const selecionado = document.querySelector('input[name="pagamento"]:checked');
  if (!selecionado) return;

  const metodo = selecionado.value;
  atualizarEstiloOpcao();

  if (metodo === "pix") {
    paymentInfo.innerHTML = `
      <div class="info-box">
        <h4>Gerando pagamento PIX...</h4>
        <p>Aguarde um instante.</p>
      </div>
    `;

    await criarPix();
  }

  if (metodo === "cartao") {
    paymentInfo.innerHTML = `
      <div class="info-box">
        <h4>Pagamento com cartão</h4>
        <p>Preencha os dados abaixo para continuar:</p>

        <div class="card-form">
          <div>
            <label for="nomeCartao">Nome no cartão</label>
            <input type="text" id="nomeCartao" placeholder="Nome como está no cartão">
          </div>

          <div>
            <label for="numeroCartao">Número do cartão</label>
            <input type="text" id="numeroCartao" placeholder="0000 0000 0000 0000" maxlength="19">
          </div>

          <div class="row">
            <div>
              <label for="validadeCartao">Validade</label>
              <input type="text" id="validadeCartao" placeholder="MM/AA" maxlength="5">
            </div>

            <div>
              <label for="cvvCartao">CVV</label>
              <input type="text" id="cvvCartao" placeholder="123" maxlength="4">
            </div>
          </div>

          <div>
            <label for="cpfTitular">CPF do titular</label>
            <input type="text" id="cpfTitular" placeholder="000.000.000-00">
          </div>

          <div>
            <label for="parcelas">Parcelamento</label>
            <select id="parcelas">
              <option value="1">1x de R$ 19,99</option>
              <option value="2">2x de R$ 10,00</option>
            </select>
          </div>
        </div>

        <p class="note">Ao clicar em continuar, os dados serão enviados para o backend.</p>
      </div>
    `;
  }
}

async function criarPix() {
  try {
    const usuario = getUsuario();

    const response = await fetch(`${API_BASE_URL}/payments/pix`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: 19.99,
        description: "Acesso ao curso CVIA",
        payer: {
          email: usuario.email || "cliente@email.com",
          first_name: getPrimeiroNome(usuario.nome),
          identification: usuario.cpf
            ? {
                type: "CPF",
                number: usuario.cpf.replace(/\D/g, "")
              }
            : undefined
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Erro ao gerar PIX.");
    }

    pagamentoAtualId = data.id;
    ultimoPixCode = data.qr_code || null;

    paymentInfo.innerHTML = `
      <div class="info-box">
        <h4>Pagamento via PIX</h4>
        <p>Use o código abaixo para realizar o pagamento:</p>

        ${
          data.qr_code_base64
            ? `<img 
                src="data:image/jpeg;base64,${data.qr_code_base64}" 
                alt="QR Code PIX" 
                style="max-width:220px;width:100%;display:block;margin:12px auto;border-radius:12px;"
              >`
            : ""
        }

        <div class="pix-key" id="pixKey">${data.qr_code || "PIX gerado, mas sem código disponível."}</div>

        <button class="copy-btn" onclick="copiarPix()">Copiar código PIX</button>
        <button class="copy-btn" onclick="consultarStatusPagamento()" style="margin-left: 8px;">Verificar pagamento</button>

        <p class="note">Status atual: ${data.status || "pendente"}</p>
      </div>
    `;
  } catch (error) {
    paymentInfo.innerHTML = `
      <div class="info-box">
        <h4>Erro ao gerar PIX</h4>
        <p>${error.message}</p>
      </div>
    `;
  }
}

function copiarPix() {
  const codigo = ultimoPixCode || document.getElementById("pixKey")?.innerText || "";

  if (!codigo) {
    alert("Nenhum código PIX disponível para copiar.");
    return;
  }

  navigator.clipboard.writeText(codigo)
    .then(() => {
      alert("Código PIX copiado com sucesso.");
    })
    .catch(() => {
      alert("Não foi possível copiar automaticamente.");
    });
}

async function consultarStatusPagamento() {
  if (!pagamentoAtualId) {
    alert("Nenhum pagamento encontrado para consulta.");
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/payments/${pagamentoAtualId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Erro ao consultar pagamento.");
    }

    if (data.status === "approved") {
      localStorage.setItem("pagamentoConfirmado", "true");
      alert("Pagamento aprovado! Acesso liberado.");
      window.location.href = "area.html";
      return;
    }

    alert(`Status atual do pagamento: ${data.status}`);
  } catch (error) {
    alert(error.message);
  }
}

async function pagarComCartao() {
  const nomeCartao = document.getElementById("nomeCartao")?.value.trim();
  const numeroCartao = document.getElementById("numeroCartao")?.value.trim();
  const validadeCartao = document.getElementById("validadeCartao")?.value.trim();
  const cvvCartao = document.getElementById("cvvCartao")?.value.trim();
  const cpfTitular = document.getElementById("cpfTitular")?.value.trim();
  const parcelas = document.getElementById("parcelas")?.value;

  if (!nomeCartao || !numeroCartao || !validadeCartao || !cvvCartao || !cpfTitular || !parcelas) {
    alert("Preencha todos os dados do cartão.");
    return;
  }

  const [mes, ano] = validadeCartao.split("/");

  if (!mes || !ano) {
    alert("Informe a validade no formato MM/AA.");
    return;
  }

  try {
    const usuario = getUsuario();

    const response = await fetch(`${API_BASE_URL}/payments/card`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount: 19.99,
        description: "Acesso ao curso CVIA",
        installments: Number(parcelas),
        payer: {
          email: usuario.email || "cliente@email.com",
          identification: {
            type: "CPF",
            number: cpfTitular.replace(/\D/g, "")
          }
        },

        /* 
          Isso é uma base visual.
          Para Mercado Pago real, o ideal depois é trocar isso por token do cartão.
        */
        card_data: {
          cardholder_name: nomeCartao,
          card_number: numeroCartao.replace(/\s/g, ""),
          expiration_month: mes,
          expiration_year: `20${ano}`,
          security_code: cvvCartao
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Erro ao processar pagamento com cartão.");
    }

    if (data.status === "approved") {
      localStorage.setItem("pagamentoConfirmado", "true");
      alert("Pagamento aprovado com sucesso.");
      window.location.href = "area.html";
      return;
    }

    alert(`Pagamento criado com status: ${data.status}`);
  } catch (error) {
    alert(error.message);
  }
}

async function confirmarPagamento() {
  const selecionado = document.querySelector('input[name="pagamento"]:checked');
  if (!selecionado) {
    alert("Selecione uma forma de pagamento.");
    return;
  }

  const metodo = selecionado.value;

  if (metodo === "pix") {
    if (!pagamentoAtualId) {
      alert("O PIX ainda não foi gerado.");
      return;
    }

    await consultarStatusPagamento();
    return;
  }

  if (metodo === "cartao") {
    await pagarComCartao();
  }
}

function voltar() {
  window.location.href = "login.html";
}

atualizarPagamento();