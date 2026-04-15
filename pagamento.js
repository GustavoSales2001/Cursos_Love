const radios = document.querySelectorAll('input[name="pagamento"]');
const paymentInfo = document.getElementById("paymentInfo");
const paymentOptions = document.querySelectorAll(".payment-option");

const API_BASE_URL = "https://cursoslove-production.up.railway.app/api";

let pagamentoAtualId = null;
let ultimoPixCode = null;

// impede pagar novamente
const usuarioAtual = JSON.parse(localStorage.getItem("usuario")) || {};
const jaPagou = usuarioAtual.email
  ? localStorage.getItem(`pagamentoConfirmado_${usuarioAtual.email}`)
  : null;

if (jaPagou === "true") {
  alert("Seu acesso já foi liberado. Você não precisa pagar novamente.");
  window.location.href = "area.html";
}

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

        <p class="note">Essa opção já aparece na tela, mas ainda depende da tokenização do Mercado Pago para funcionar de verdade. Por enquanto, finalize pelo PIX.</p>
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
      throw new Error(data.error || data.details || "Erro ao gerar PIX.");
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
                style="max-width:220px;width:100%;display:block;margin:12px auto;border-radius:12px;"
              >`
            : ""
        }

        <div class="pix-key" id="pixKey">${data.qr_code}</div>

        <button onclick="copiarPix()">Copiar código PIX</button>
        <button onclick="consultarStatusPagamento()">Verificar pagamento</button>
      </div>
    `;
  } catch (error) {
    alert(error.message);
  }
}

function copiarPix() {
  if (!ultimoPixCode) {
    alert("Nenhum código PIX disponível.");
    return;
  }

  navigator.clipboard.writeText(ultimoPixCode);
  alert("Copiado!");
}

async function consultarStatusPagamento() {
  if (!pagamentoAtualId) {
    alert("Nenhum pagamento encontrado.");
    return;
  }

  const response = await fetch(`${API_BASE_URL}/payments/${pagamentoAtualId}`);
  const data = await response.json();

  if (data.status === "approved") {
    const usuario = JSON.parse(localStorage.getItem("usuario")) || {};
    if (usuario.email) {
      localStorage.setItem(`pagamentoConfirmado_${usuario.email}`, "true");
    }

    alert("Pagamento aprovado!");
    window.location.href = "area.html";
  } else {
    alert("Pagamento ainda não aprovado");
  }
}

function voltar() {
  window.location.href = "login.html";
}

atualizarPagamento();