const radios = document.querySelectorAll('input[name="pagamento"]');
const paymentInfo = document.getElementById("paymentInfo");
const paymentOptions = document.querySelectorAll(".payment-option");

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

function atualizarPagamento() {
  const selecionado = document.querySelector('input[name="pagamento"]:checked');
  if (!selecionado) return;

  const metodo = selecionado.value;

  atualizarEstiloOpcao();

  if (metodo === "pix") {
    paymentInfo.innerHTML = `
      <div class="info-box">
        <h4>Pagamento via PIX</h4>
        <p>Use a chave abaixo para realizar o pagamento:</p>
        <div class="pix-key" id="pixKey">11922198936</div>
        <button class="copy-btn" onclick="copiarPix()">Copiar chave PIX</button>
        <p class="note">Após o pagamento, clique em continuar para liberar o acesso.</p>
      </div>
    `;
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
              <option value="1x">1x de R$ 19,99</option>
              <option value="2x">2x de R$ 9,99</option>
            </select>
          </div>
        </div>

        <p class="note">Esta etapa ainda é uma simulação visual. Para cobrança real, será necessário integrar um gateway de pagamento.</p>
      </div>
    `;
  }
}

function copiarPix() {
  const chavePix = "11922198936";
  navigator.clipboard.writeText(chavePix)
    .then(() => {
      alert("Chave PIX copiada com sucesso.");
    })
    .catch(() => {
      alert("Não foi possível copiar automaticamente. Chave PIX: 11922198936");
    });
}

function confirmarPagamento() {
  const selecionado = document.querySelector('input[name="pagamento"]:checked');
  if (!selecionado) {
    alert("Selecione uma forma de pagamento.");
    return;
  }

  const metodo = selecionado.value;

  if (metodo === "cartao") {
    const nomeCartao = document.getElementById("nomeCartao")?.value.trim();
    const numeroCartao = document.getElementById("numeroCartao")?.value.trim();
    const validadeCartao = document.getElementById("validadeCartao")?.value.trim();
    const cvvCartao = document.getElementById("cvvCartao")?.value.trim();
    const cpfTitular = document.getElementById("cpfTitular")?.value.trim();

    if (!nomeCartao || !numeroCartao || !validadeCartao || !cvvCartao || !cpfTitular) {
      alert("Preencha todos os dados do cartão.");
      return;
    }
  }

  localStorage.setItem("pagamentoConfirmado", "true");
  alert("Pagamento confirmado com sucesso.");
  window.location.href = "area.html";
}

function voltar() {
  window.location.href = "login.html";
}

atualizarEstiloOpcao();