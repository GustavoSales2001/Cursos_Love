document.addEventListener("DOMContentLoaded", async () => {
  const API_BASE_URL = "https://cursoslove-production.up.railway.app/api";

  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      const target = button.getAttribute("data-tab");

      tabButtons.forEach(btn => btn.classList.remove("active"));
      tabContents.forEach(content => content.classList.remove("active"));

      button.classList.add("active");

      const targetElement = document.getElementById(target);
      if (targetElement) {
        targetElement.classList.add("active");
      }
    });
  });

  function abrirTab(tabId) {
    tabButtons.forEach(btn => btn.classList.remove("active"));
    tabContents.forEach(content => content.classList.remove("active"));

    const btn = document.querySelector(`[data-tab="${tabId}"]`);
    const content = document.getElementById(tabId);

    if (btn) btn.classList.add("active");
    if (content) content.classList.add("active");
  }

  window.abrirTab = abrirTab;

  const usuario = JSON.parse(localStorage.getItem("usuario"));

  if (!usuario || !usuario.email) {
    alert("Você precisa fazer login primeiro.");
    window.location.href = "login.html";
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/users/access/${encodeURIComponent(usuario.email)}`
    );

    const data = await response.json();

    if (!response.ok || !data.user) {
      alert("Usuário não encontrado. Faça login novamente.");
      localStorage.removeItem("usuario");
      window.location.href = "login.html";
      return;
    }

    const usuarioBanco = data.user;

    localStorage.setItem(
      "usuario",
      JSON.stringify({
        ...usuario,
        nome: usuario.nome || usuarioBanco.name || "",
        email: usuarioBanco.email
      })
    );

    if (usuarioBanco.access_released !== 1) {
      alert("Você precisa finalizar o pagamento antes de acessar o conteúdo.");
      window.location.href = "pagamento.html";
      return;
    }

    const usuarioAtualizado = JSON.parse(localStorage.getItem("usuario"));

    const welcomeText = document.getElementById("welcomeText");
    if (welcomeText) {
      welcomeText.textContent = `Olá, ${usuarioAtualizado.nome || "aluno(a)"}. Bom te ver por aqui.`;
    }

    const perfilNome = document.getElementById("perfilNome");
    const perfilEmail = document.getElementById("perfilEmail");
    const perfilCelular = document.getElementById("perfilCelular");
    const perfilNascimento = document.getElementById("perfilNascimento");
    const perfilArea = document.getElementById("perfilArea");

    if (perfilNome) perfilNome.textContent = usuarioAtualizado.nome || "-";
    if (perfilEmail) perfilEmail.textContent = usuarioAtualizado.email || "-";
    if (perfilCelular) perfilCelular.textContent = usuarioAtualizado.celular || "-";
    if (perfilNascimento) perfilNascimento.textContent = usuarioAtualizado.nascimento || "-";
    if (perfilArea) perfilArea.textContent = usuarioAtualizado.area || "-";
  } catch (error) {
    console.error("Erro ao validar acesso:", error);
    alert("Erro ao validar acesso. Tente novamente.");
    window.location.href = "login.html";
    return;
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.removeItem("usuario");
      alert("Você saiu da área do aluno.");
      window.location.href = "login.html";
    });
  }

  const modulesData = [
    {
      id: 1,
      title: "Como os sistemas analisam currículos",
      description: "Entenda como ATS, filtros automáticos e leitura por palavras-chave impactam sua candidatura.",
      lessons: [
        {
          id: "1.1",
          title: "O que é ATS",
          shortText: "Entenda por que o sistema é o primeiro filtro antes do recrutador.",
          content: `
            <p>Hoje, grande parte das empresas utiliza sistemas chamados <strong>ATS (Applicant Tracking System)</strong> para organizar, filtrar e classificar currículos antes da etapa humana.</p>
            <p>Esses sistemas não analisam potencial, simpatia ou intenção. Eles leem texto, identificam padrões e comparam o conteúdo do currículo com a vaga.</p>
            <p>O principal papel do ATS é reduzir o volume de currículos que chegam até o recrutador. Em vez de uma análise manual de centenas de perfis, o sistema prioriza os mais compatíveis.</p>
            <div class="lesson-highlight">
              <strong>Ponto-chave:</strong>
              <p>Seu currículo precisa funcionar para dois públicos: primeiro o sistema, depois o recrutador.</p>
            </div>
            <ul>
              <li>O ATS busca compatibilidade textual.</li>
              <li>Ele identifica cargos, termos técnicos e experiências.</li>
              <li>Se seu currículo não estiver claro, ele pode nem chegar ao RH.</li>
            </ul>
          `
        },
        {
          id: "1.2",
          title: "Como o sistema lê seu currículo",
          shortText: "Veja o que o ATS consegue ler e o que costuma atrapalhar.",
          content: `
            <p>O ATS não “enxerga” design da mesma forma que uma pessoa. Ele lê blocos de texto e tenta reconhecer informações importantes como cargo, habilidades, tempo de experiência e ferramentas.</p>
            <p>Currículos com colunas, ícones, gráficos, imagens e elementos muito visuais podem dificultar a interpretação automática.</p>
            <p>Quando o sistema não consegue identificar um campo importante, ele pode considerar que essa informação não existe.</p>
            <ul>
              <li>O ATS lê melhor textos simples e organizados.</li>
              <li>Arquivos mal estruturados podem ser parcialmente ignorados.</li>
              <li>Visual bonito não compensa leitura ruim.</li>
            </ul>
            <div class="lesson-highlight">
              <strong>Exemplo prático:</strong>
              <p>Se o cargo estiver dentro de uma caixa visual ou imagem, o sistema pode não reconhecer seu histórico profissional corretamente.</p>
            </div>
          `
        },
        {
          id: "1.3",
          title: "Por que currículos são rejeitados",
          shortText: "Saiba os erros mais comuns que fazem um currículo perder força.",
          content: `
            <p>Muitas rejeições não acontecem por falta de capacidade, mas por falta de adaptação do currículo à vaga e ao sistema.</p>
            <ol>
              <li><strong>Falta de palavras-chave:</strong> o currículo não conversa com a descrição da vaga.</li>
              <li><strong>Informações genéricas:</strong> frases vagas não ajudam o sistema a entender sua experiência.</li>
              <li><strong>Formatação inadequada:</strong> layouts complexos reduzem a leitura correta.</li>
              <li><strong>Falta de alinhamento:</strong> currículo genérico tende a ter baixa compatibilidade.</li>
            </ol>
            <div class="lesson-highlight">
              <strong>Importante:</strong>
              <p>O ATS não rejeita “pessoas ruins”. Ele rejeita currículos mal estruturados ou mal alinhados com a vaga.</p>
            </div>
          `
        },
        {
          id: "1.4",
          title: "O que faz um currículo passar",
          shortText: "Descubra o que realmente aumenta a chance de aprovação.",
          content: `
            <p>Um currículo eficiente para ATS é <strong>claro, objetivo, bem estruturado e adaptado à vaga</strong>.</p>
            <p>Ele utiliza palavras-chave relevantes, organiza as informações em uma sequência lógica e evita elementos que dificultem a leitura.</p>
            <ul>
              <li>Clareza na apresentação do cargo e experiência.</li>
              <li>Habilidades específicas e relevantes.</li>
              <li>Resumo profissional alinhado à vaga.</li>
              <li>Formatação simples e estratégica.</li>
            </ul>
            <div class="lesson-highlight">
              <strong>Mensagem final do módulo:</strong>
              <p>Simplicidade não é falta de qualidade. No currículo, simplicidade é estratégia.</p>
            </div>
          `
        }
      ]
    },
    {
      id: 2,
      title: "Estrutura de um currículo forte",
      description: "Aprenda como montar um currículo organizado, direto e estratégico para leitura rápida.",
      lessons: [
        {
          id: "2.1",
          title: "Estrutura ideal",
          shortText: "Entenda a ordem correta das seções do currículo.",
          content: `
            <p>Um currículo forte segue uma estrutura lógica e fácil de ler. Isso ajuda tanto o ATS quanto o recrutador.</p>
            <ol>
              <li>Dados pessoais</li>
              <li>Resumo profissional</li>
              <li>Experiência profissional</li>
              <li>Formação</li>
              <li>Habilidades</li>
            </ol>
            <p>Quando a informação está bem distribuída, a leitura fica mais rápida e o valor do seu perfil fica mais evidente.</p>
          `
        },
        {
          id: "2.2",
          title: "O que colocar em cada parte",
          shortText: "Saiba o que entra em cada seção e o que deve ser evitado.",
          content: `
            <p>No resumo profissional, seja direto e alinhado com a vaga. Evite frases prontas e genéricas.</p>
            <p>Na experiência, cada item deve ter cargo, empresa, período e descrição objetiva.</p>
            <p>Nas habilidades, prefira itens específicos como Excel intermediário, CRM, atendimento ao cliente e gestão de agenda.</p>
            <div class="lesson-highlight">
              <strong>Evite:</strong>
              <p>“Sou proativo, dedicado e comunicativo.”</p>
              <strong>Prefira:</strong>
              <p>“Excel intermediário, atendimento ao cliente, controle de agenda e suporte administrativo.”</p>
            </div>
          `
        },
        {
          id: "2.3",
          title: "O que remover",
          shortText: "Veja o que enfraquece o currículo e deve sair.",
          content: `
            <p>Um currículo mais enxuto costuma ser mais eficiente. Remova excessos e informações que não ajudam sua candidatura.</p>
            <ul>
              <li>Objetivos genéricos</li>
              <li>Informações irrelevantes</li>
              <li>Dados pessoais excessivos</li>
              <li>Experiências desconectadas sem contexto</li>
            </ul>
            <p>O currículo não precisa contar sua vida toda. Ele precisa mostrar o que importa para a vaga.</p>
          `
        },
        {
          id: "2.4",
          title: "Layout que funciona",
          shortText: "Estruture visualmente seu currículo de forma estratégica.",
          content: `
            <p>Use fonte simples, texto alinhado, sem colunas complexas e sem gráficos desnecessários.</p>
            <p>Evite designs muito elaborados, excesso de cores e elementos decorativos que atrapalham a leitura.</p>
            <div class="lesson-highlight">
              <strong>Regra prática:</strong>
              <p>Se o visual chama mais atenção do que o conteúdo, o currículo perdeu o foco.</p>
            </div>
          `
        }
      ]
    },
    {
      id: 3,
      title: "Palavras-chave e compatibilidade",
      description: "Aprenda a adaptar o currículo para cada vaga sem mentir e sem parecer artificial.",
      lessons: [
        {
          id: "3.1",
          title: "O que são palavras-chave",
          shortText: "Entenda como termos da vaga influenciam sua aprovação.",
          content: `
            <p>Palavras-chave são termos que representam habilidades, ferramentas, funções e qualificações.</p>
            <p>Elas são extraídas da descrição da vaga e comparadas com o seu currículo para medir compatibilidade.</p>
            <ul>
              <li>Ferramentas: Excel, CRM, Power BI</li>
              <li>Funções: atendimento, prospecção, suporte administrativo</li>
              <li>Competências: organização, comunicação, análise</li>
            </ul>
          `
        },
        {
          id: "3.2",
          title: "Como identificar palavras-chave",
          shortText: "Aprenda a ler a vaga com olhar estratégico.",
          content: `
            <p>Leia a vaga com atenção e destaque termos repetidos, ferramentas exigidas e habilidades específicas.</p>
            <p>Separe técnicas e comportamentais para entender o que precisa aparecer no currículo.</p>
            <div class="lesson-highlight">
              <strong>Exemplo:</strong>
              <p>Se a vaga cita várias vezes “Excel” e “atendimento ao cliente”, esses termos têm alto peso e precisam aparecer com contexto real.</p>
            </div>
          `
        },
        {
          id: "3.3",
          title: "Como adaptar seu currículo",
          shortText: "Saiba adaptar sem inventar experiências.",
          content: `
            <p>Adaptar não é mentir. É reorganizar e priorizar o que você já fez para mostrar mais aderência à vaga.</p>
            <ul>
              <li>Inclua palavras-chave relevantes</li>
              <li>Reorganize experiências</li>
              <li>Destaque o que é mais importante para aquela oportunidade</li>
            </ul>
          `
        },
        {
          id: "3.4",
          title: "Erros comuns",
          shortText: "Evite os exageros que enfraquecem sua candidatura.",
          content: `
            <ul>
              <li>Copiar a vaga inteira</li>
              <li>Usar palavras sem contexto</li>
              <li>Inserir termos irrelevantes</li>
              <li>Exagerar ou mentir</li>
            </ul>
            <p>Esses erros podem até confundir o sistema, mas derrubam sua credibilidade quando o recrutador lê ou quando a entrevista começa.</p>
          `
        }
      ]
    },
    {
      id: 4,
      title: "Como destacar experiências e resultados",
      description: "Transforme tarefas em valor percebido e fortaleça suas descrições profissionais.",
      lessons: [
        {
          id: "4.1",
          title: "Tarefa vs resultado",
          shortText: "Aprenda a mostrar impacto, não só obrigação.",
          content: `
            <p>Tarefa descreve o que você fazia. Resultado mostra o efeito do seu trabalho.</p>
            <div class="lesson-highlight">
              <strong>Tarefa:</strong>
              <p>“Atendimento ao cliente”</p>
              <strong>Resultado:</strong>
              <p>“Atendimento ao cliente com foco em resolução de demandas e fidelização.”</p>
            </div>
          `
        },
        {
          id: "4.2",
          title: "Como escrever experiências",
          shortText: "Use uma estrutura simples e forte nas descrições.",
          content: `
            <p>Use a lógica: <strong>Ação + contexto + impacto</strong>.</p>
            <p>Exemplo: “Organização de agenda corporativa, garantindo otimização do tempo e redução de conflitos.”</p>
            <p>Esse tipo de escrita mostra clareza e valor.</p>
          `
        },
        {
          id: "4.3",
          title: "Mesmo sem experiência formal",
          shortText: "Saiba como valorizar o que você já fez.",
          content: `
            <p>Se você não tem experiência formal, use projetos acadêmicos, trabalhos voluntários, atividades informais e cursos práticos.</p>
            <p>O importante é mostrar aplicação e não só teoria.</p>
          `
        },
        {
          id: "4.4",
          title: "Habilidades relevantes",
          shortText: "Priorize o que realmente importa para a vaga.",
          content: `
            <p>Divida suas habilidades em técnicas e comportamentais.</p>
            <ul>
              <li><strong>Técnicas:</strong> ferramentas, softwares, conhecimentos específicos</li>
              <li><strong>Comportamentais:</strong> organização, comunicação, trabalho em equipe</li>
            </ul>
            <p>Sempre priorize as habilidades mais conectadas ao objetivo profissional.</p>
          `
        }
      ]
    }
  ];

  const totalLessons = modulesData.reduce((acc, module) => acc + module.lessons.length, 0);

  const moduleCardsContainer = document.getElementById("modulesCardsContainer");
  const moduleSummaryTitle = document.getElementById("moduleSummaryTitle");
  const moduleSummaryDescription = document.getElementById("moduleSummaryDescription");
  const moduleSummaryPoints = document.getElementById("moduleSummaryPoints");
  const moduleStatusBox = document.getElementById("moduleStatusBox");
  const moduleSummaryWrap = document.querySelector("#modulos .module-summary-wrap");
  const moduleSummaryCard = document.querySelector("#modulos .module-summary-card");

  const lessonListContainer = document.getElementById("lessonListContainer");
  const currentModuleLabel = document.getElementById("currentModuleLabel");
  const lessonTitle = document.getElementById("lessonTitle");
  const lessonShortText = document.getElementById("lessonShortText");
  const lessonContent = document.getElementById("lessonContent");
  const markLessonBtn = document.getElementById("markLessonBtn");
  const lessonStatusText = document.getElementById("lessonStatusText");
  const progressFill = document.getElementById("progressFill");
  const progressText = document.getElementById("progressText");

  const progressKey = usuario.email ? `courseProgress_${usuario.email}` : "courseProgress_default";

  const defaultProgress = {
    completedLessons: [],
    unlockedModule: 1,
    currentModule: 1,
    currentLesson: "1.1"
  };

  const storedProgress = JSON.parse(localStorage.getItem(progressKey)) || defaultProgress;
  let courseProgress = {
    ...defaultProgress,
    ...storedProgress
  };

  function saveProgress() {
    localStorage.setItem(progressKey, JSON.stringify(courseProgress));
  }

  function getModuleById(moduleId) {
    return modulesData.find(module => module.id === moduleId);
  }

  function getLessonById(moduleId, lessonId) {
    const module = getModuleById(moduleId);
    if (!module) return null;
    return module.lessons.find(lesson => lesson.id === lessonId);
  }

  function getCompletedCountByModule(moduleId) {
    return courseProgress.completedLessons.filter(id => id.startsWith(`${moduleId}.`)).length;
  }

  function isModuleCompleted(moduleId) {
    const module = getModuleById(moduleId);
    if (!module) return false;
    return getCompletedCountByModule(moduleId) === module.lessons.length;
  }

  function isLessonCompleted(lessonId) {
    return courseProgress.completedLessons.includes(lessonId);
  }

  function updateProgressUI() {
    const completed = courseProgress.completedLessons.length;
    const percent = Math.round((completed / totalLessons) * 100);

    if (progressFill) {
      progressFill.style.width = `${percent}%`;
    }

    if (progressText) {
      progressText.textContent = `${percent}% concluído`;
    }
  }

  function renderModules() {
    if (!moduleCardsContainer) return;

    moduleCardsContainer.innerHTML = "";

    modulesData.forEach(module => {
      const unlocked = module.id <= courseProgress.unlockedModule;
      const completedCount = getCompletedCountByModule(module.id);
      const moduleDone = isModuleCompleted(module.id);

      const card = document.createElement("div");
      card.className = `module-card ${unlocked ? "" : "locked-module locked"} ${courseProgress.currentModule === module.id ? "active-module" : ""}`;
      card.innerHTML = `
        <span class="module-tag">Módulo ${module.id}</span>
        <h3>${module.title}</h3>
        <p>${module.description}</p>
        <div class="module-meta">
          <span>${completedCount}/${module.lessons.length} aulas concluídas</span>
          <span class="module-status ${moduleDone ? "status-done" : unlocked ? "status-open" : "status-locked"}">
            ${moduleDone ? "Concluído" : unlocked ? "Liberado" : "Bloqueado"}
          </span>
        </div>
      `;

      card.addEventListener("click", () => {
        if (!unlocked) {
          alert("Finalize o módulo anterior para liberar este conteúdo.");
          return;
        }

        courseProgress.currentModule = module.id;

        const firstPendingLesson = module.lessons.find(lesson => !isLessonCompleted(lesson.id));
        courseProgress.currentLesson = firstPendingLesson ? firstPendingLesson.id : module.lessons[0].id;

        saveProgress();
        renderModules();
        renderModuleSummary();
        renderLessons();
        renderLessonDetail();
        abrirTab("aulas");
      });

      moduleCardsContainer.appendChild(card);
    });
  }

  function renderModuleSummary() {
    const module = getModuleById(courseProgress.currentModule);
    if (!module) return;

    if (moduleSummaryWrap) {
      moduleSummaryWrap.style.display = module.id === 1 ? "flex" : "none";
    }

    if (moduleSummaryCard) {
      moduleSummaryCard.style.display = module.id === 1 ? "block" : "none";
    }

    if (module.id !== 1) {
      if (moduleStatusBox) {
        const completed = getCompletedCountByModule(module.id);
        const done = isModuleCompleted(module.id);

        moduleStatusBox.innerHTML = `
          <h3>Status do módulo</h3>
          <p><strong>Progresso:</strong> ${completed}/${module.lessons.length} aulas concluídas</p>
          <p><strong>Situação:</strong> ${done ? "Módulo finalizado" : "Em andamento"}</p>
          <p><strong>Próximo passo:</strong> ${done ? "Você já pode seguir para o próximo módulo." : "Marque as aulas como concluídas para liberar a próxima etapa."}</p>
        `;
      }
      return;
    }

    if (moduleSummaryTitle) {
      moduleSummaryTitle.textContent = `Módulo ${module.id} — ${module.title}`;
    }

    if (moduleSummaryDescription) {
      moduleSummaryDescription.textContent = module.description;
    }

    if (moduleSummaryPoints) {
      const extraPoints = {
        1: [
          "Entender o que é ATS e por que ele impacta diretamente sua candidatura.",
          "Aprender como o sistema lê texto, identifica cargos e interpreta habilidades.",
          "Reconhecer os erros que eliminam bons perfis antes da leitura humana.",
          "Construir uma base estratégica para os próximos módulos."
        ]
      };

      moduleSummaryPoints.innerHTML = extraPoints[module.id]
        .map(point => `<li>${point}</li>`)
        .join("");
    }

    if (moduleStatusBox) {
      const completed = getCompletedCountByModule(module.id);
      const done = isModuleCompleted(module.id);

      moduleStatusBox.innerHTML = `
        <h3>Status do módulo</h3>
        <p><strong>Progresso:</strong> ${completed}/${module.lessons.length} aulas concluídas</p>
        <p><strong>Situação:</strong> ${done ? "Módulo finalizado" : "Em andamento"}</p>
        <p><strong>Próximo passo:</strong> ${done ? "Você já pode seguir para o próximo módulo." : "Marque as aulas como concluída para liberar a próxima etapa."}</p>
      `;
    }
  }

  function renderLessons() {
    if (!lessonListContainer) return;

    const module = getModuleById(courseProgress.currentModule);
    if (!module) return;

    if (currentModuleLabel) {
      currentModuleLabel.textContent = `Conteúdo do módulo ${module.id}`;
    }

    lessonListContainer.innerHTML = "";

    module.lessons.forEach(lesson => {
      const done = isLessonCompleted(lesson.id);

      const item = document.createElement("div");
      item.className = `lesson-item ${courseProgress.currentLesson === lesson.id ? "active-lesson" : ""} ${done ? "done-lesson" : ""}`;
      item.innerHTML = `
        <h4>Aula ${lesson.id}</h4>
        <p>${lesson.title}</p>
        <p>${lesson.shortText}</p>
        <span class="lesson-chip ${done ? "done" : ""}">
          ${done ? "Concluída" : "Disponível"}
        </span>
      `;

      item.addEventListener("click", () => {
        courseProgress.currentLesson = lesson.id;
        saveProgress();
        renderLessons();
        renderLessonDetail();
      });

      lessonListContainer.appendChild(item);
    });
  }

  function renderLessonDetail() {
    const module = getModuleById(courseProgress.currentModule);
    if (!module) return;

    const lesson = getLessonById(courseProgress.currentModule, courseProgress.currentLesson);
    if (!lesson) return;

    if (lessonTitle) {
      lessonTitle.textContent = `Aula ${lesson.id}: ${lesson.title}`;
    }

    if (lessonShortText) {
      lessonShortText.textContent = lesson.shortText;
    }

    if (lessonContent) {
      lessonContent.innerHTML = lesson.content;
    }

    const done = isLessonCompleted(lesson.id);

    if (markLessonBtn) {
      markLessonBtn.textContent = done ? "Aula já marcada como concluida" : "Marcar como concluido";
      markLessonBtn.classList.toggle("completed", done);

      markLessonBtn.onclick = () => {
        if (isLessonCompleted(lesson.id)) {
          alert("Essa aula já foi marcada como concluida.");
          return;
        }

        courseProgress.completedLessons.push(lesson.id);

        const currentModuleCompleted = isModuleCompleted(module.id);

        if (currentModuleCompleted && courseProgress.unlockedModule === module.id && module.id < modulesData.length) {
          courseProgress.unlockedModule = module.id + 1;
          alert(`Módulo ${module.id} finalizado com sucesso! O módulo ${module.id + 1} foi liberado.`);
        } else {
          alert("Aula marcada como concluida com sucesso!");
        }

        const nextLesson = module.lessons.find(item => !isLessonCompleted(item.id));

        if (nextLesson) {
          courseProgress.currentLesson = nextLesson.id;
        } else if (module.id < courseProgress.unlockedModule) {
          courseProgress.currentModule = module.id + 1;
          const nextModule = getModuleById(courseProgress.currentModule);
          if (nextModule) {
            courseProgress.currentLesson = nextModule.lessons[0].id;
          }
        }

        saveProgress();
        renderModules();
        renderModuleSummary();
        renderLessons();
        renderLessonDetail();
        updateProgressUI();
      };
    }

    if (lessonStatusText) {
      lessonStatusText.textContent = done
        ? "Status: aula concluída"
        : "Status: aula disponível para concluir";
    }
  }

  renderModules();
  renderModuleSummary();
  renderLessons();
  renderLessonDetail();
  updateProgressUI();
});