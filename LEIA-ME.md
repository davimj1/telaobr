# Zart Telão — como colocar pra funcionar

*Um projeto do grupo Zart.*

Site particular pra você e seus amigos: login com Google, servidores com canais de texto e voz, chat completo (responder, reagir, editar, fixar, buscar, imagens), avisos com som e notificação, cargos e permissões, mensagens diretas, chamada de voz com apertar-pra-falar, câmera e compartilhamento de tela (com som da aba/jogo).
Funciona direto no navegador, sem instalar nada. Hospedagem grátis (GitHub Pages) + banco grátis (Firebase).

## Estrutura do projeto

```
telaobr/
├── index.html          página única (HTML5 semântico, sem estilo inline)
├── css/
│   └── style.css       todo o visual, dividido em 13 seções comentadas
├── js/                 módulos pequenos, um assunto por arquivo
│   ├── main.js         ponto de entrada: liga as partes
│   ├── config.js       Firebase, cargos, permissões padrão, modelos de servidor, emojis, limites
│   ├── firebase.js     conexão com o Firebase
│   ├── estado.js       estado do app (no F12, digite Telao)
│   ├── util.js         funções pequenas reutilizáveis
│   ├── compat.js       celular, iPhone e navegadores
│   ├── ui.js           redesenhar a tela e abas do celular
│   ├── auth.js         login com Google
│   ├── perfis.js       nome, foto e status (online/AFK/offline)
│   ├── permissoes.js   cargos e o que cada um pode fazer
│   ├── servidores.js   criar, convidar, sair, excluir
│   ├── canais.js       canais de texto e voz
│   ├── chat.js         mensagens, responder, reagir, fixar, anexos
│   ├── emoji.js        seletor de emoji
│   ├── membros.js      lista de membros, moderação e configurações do servidor
│   ├── dm.js           mensagens diretas
│   ├── call.js         entrar/sair de canais de voz e presença
│   ├── rtc.js          conexões de voz e vídeo (WebRTC)
│   ├── midia.js        microfone, apertar pra falar, câmera, tela, ensurdecer
│   ├── palco.js        telas ao vivo e pessoas do canal de voz
│   ├── fala.js         indicador de quem está falando
│   ├── avisos.js       não lidas, menções, sons, notificações e título da aba
│   ├── ponte.js        configurar a ponte (TURN) pelo site
│   ├── app.js          instalar como app e notificações pelo service worker
│   ├── amigos.js       código de amigo, pedidos de amizade e tela de amigos
│   ├── cookies.js      aviso e preferências de cookies (análise só liga se a pessoa aceitar)
│   └── privacidade.js  LGPD: baixar meus dados e excluir minha conta
├── privacidade.html, termos.html, cookies.html, reembolso.html   páginas legais (LGPD/CDC)
├── sw.js               service worker: guarda o site no aparelho e permite instalar
├── manifest.webmanifest  nome, cores e ícones do app
├── img/                zart/ (logo e favicon Zart), google.svg, icones/ (ícones do app)
├── docs/
│   └── requisitos.md   requisitos, casos de uso e diagramas UML
├── firestore.rules     regras de segurança do banco (cargos e permissões checados aqui)
└── LEIA-ME.md
```

**Mudar algo comum:**
- Cores → `css/style.css`, seção 1 (variáveis).
- Permissões padrão de cada cargo, modelos de servidor, emojis, limites → `js/config.js`.
- Qualidades de transmissão e de voz, TURN (seção 4) → `js/config.js`.

> ⚠️ **Sempre que atualizar o Telão, cole o `firestore.rules` novo no Firebase** (passo 1.4). A versão 3.0 (padrão Zart + LGPD) mudou as regras: cada pessoa pode apagar o próprio perfil, código de amigo e conversas ("Excluir minha conta"). Sem as regras novas, excluir a conta dá erro no meio.
>
> Na versão 3.0, todo mundo precisa marcar "Tenho 18 anos ou mais e li e concordo…" uma vez (no login ou numa janela ao abrir).
>
> A versão 2.3 mudou as regras: amizades, códigos de amigo e mensagem direta só entre amigos. Sem as regras novas, adicionar amigo dá erro.
>
> Depois de atualizar pra 2.3, **adicionem uns aos outros como amigos**: conversas diretas antigas ficam só pra leitura até vocês virarem amigos.
>
> ⚠️ **Atualizando da versão 1?** Cole o `firestore.rules` novo no Firebase (passo 1.4) — sem isso, canais, cargos e mensagens diretas dão `permission-denied`. Servidores antigos ganham um canal "geral" e um "Bate-papo" sozinhos quando o dono abre (as mensagens do chat antigo não aparecem nos canais novos).

## 1. Criar o projeto no Firebase (5 minutos)

1. Entre em https://console.firebase.google.com e clique em **Adicionar projeto** (pode desligar o Analytics).
2. No menu da esquerda: **Build → Authentication → Começar → Sign-in method → Google → Ativar** (escolha seu e-mail como e-mail de suporte e salve).
3. **Build → Firestore Database → Criar banco de dados** → escolha a região `southamerica-east1 (São Paulo)` → modo produção.
4. Ainda no Firestore, aba **Regras**: apague tudo, cole o conteúdo do arquivo `firestore.rules` e clique em **Publicar**.
5. Na engrenagem ⚙️ → **Configurações do projeto** → em "Seus apps" clique no ícone **</>** (Web), dê um nome e registre.
   Vai aparecer um bloco `const firebaseConfig = { ... }`.
6. A configuração do projeto **telaobr** já está em `js/config.js`. Se um dia criar outro projeto, troque o bloco `firebaseConfig` lá.

## 2. Colocar no ar (GitHub Pages)

1. Crie um repositório (pode ser privado só se tiver GitHub Pro; senão, público mesmo — o código não tem senha nenhuma).
2. Suba **a pasta inteira** (index.html, css/, js/, img/). Os arquivos de `docs/` e este LEIA-ME são opcionais.
3. **Settings → Pages → Branch: main / root → Save**. Em 1–2 min o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.
4. No Firebase: **Authentication → Configurações → Domínios autorizados → Adicionar** `SEU-USUARIO.github.io`.

Pra testar no seu PC antes: abra a pasta no VS Code e use a extensão **Live Server** (e adicione `127.0.0.1` em Domínios autorizados) (abrir o arquivo com dois cliques não funciona, porque o navegador bloqueia mic/tela fora de `http://localhost` ou `https://`).

## 3. Como usar

**Instalar como app (igual Discord e TeamSpeak)**
- **PC (Chrome ou Edge):** clique no botão verde ⬇ no fim da barra da esquerda (ou no ícone de instalar na barra de endereço) → **Instalar**. O Telão ganha ícone na área de trabalho/menu Iniciar e abre numa janela só dele.
- **Android (Chrome):** botão verde ⬇ (aba Canais) → **Instalar**. Vira um app na tela inicial.
- **iPhone/iPad:** no **Safari**, toque em **Compartilhar** → **Adicionar à Tela de Início**. (O botão ⬇ mostra esse passo a passo.) Na primeira vez, entre com o Google de novo dentro do app.
- O app se atualiza sozinho: quando você sobe arquivos novos no GitHub, todo mundo recebe na próxima vez que abrir.
- Firefox no PC não instala sites; use Chrome ou Edge pra ter o app.

**Servidores e canais**
- **Entrar com Google.** Seus servidores ficam salvos na conta e aparecem em qualquer PC ou celular.
- **+** na barra da esquerda cria um servidor. Escolha um modelo: 🎮 Gamer, 🍿 Amigos, 📚 Estudos ou ✨ Simples (cada um já vem com canais).
- 🔗 copia o **convite**. Quem abrir o link e entrar com Google vira membro.
- **Foto de capa:** ⚙️ → Geral → **Escolher imagem** (só o dono). Aparece na bolinha do servidor (barra da esquerda) e no topo da lista de canais, atrás do nome do servidor. Imagem deitada (tipo 3:1) fica melhor; pode ser GIF leve.
- **# Canais de texto** são pra conversar; **🔊 canais de voz** são pra call, câmera e live. O **+** ao lado do título cria canal; o **⋯** renomeia ou apaga.
- Você fica conectado na voz mesmo navegando por outros canais e servidores. O quadro **Voz conectada** (embaixo) mostra onde você está e tem o botão de desligar.

**Chat**
- **Enter** envia, **Shift+Enter** pula linha.
- Passe o mouse numa mensagem: 🙂 reagir · ↩ responder · ⋯ editar, fixar, copiar, apagar.
- **Editar:** ⋯ → Editar, ou aperte **↑** com o campo vazio pra editar sua última mensagem. **Enter** salva, **Esc** cancela. Aparece *(editada)* pra todo mundo.
- 🔍 no topo (ou **Ctrl+F**) **busca** nas últimas 1000 mensagens do canal, por texto ou nome, sem ligar pra acento ou maiúscula. Clique num resultado pra ir até a mensagem (mesmo se for antiga).
- Embaixo do chat aparece **"Fulano está digitando…"**.
- **+** envia imagem ou arquivo (até 700 KB). Também dá pra **colar** um print (Ctrl+V) ou **arrastar** o arquivo pro chat.
- Escreva **@nome** ou **@todos** pra chamar alguém — a mensagem fica destacada pra pessoa.
- 📌 no topo mostra as mensagens fixadas (‹ › navega entre elas).

**Membros, cargos e moderação**
- Clique em alguém na lista da direita: **Mensagem direta**, **Tornar Admin/Moderador/Membro**, **Expulsar**, **Banir** (só aparece o que seu cargo pode).
- ⚙️ ao lado do nome do servidor: **Geral** (renomear, sair, excluir), **Permissões** (tabela do que cada cargo pode fazer) e **Banidos** (desbanir).
- Expulsar: a pessoa pode voltar com o convite. Banir: não volta.

**Avisos**
- Canal com mensagem nova fica em **negrito**; servidor com novidade ganha um **tracinho branco** na barra da esquerda.
- Quando te marcam (**@seunome** ou **@todos**) aparece um **número vermelho** no canal e no servidor, e a aba do navegador mostra **(1) Telão**. Mensagem direta nova também conta.
- **Som** quando te marcam, quando chega mensagem direta e quando alguém entra ou sai da sua call.
- **Notificação do sistema** (aquela do canto da tela) pras mesmas coisas, quando o Telão estiver minimizado ou em outra aba. Na primeira vez aparece uma faixa laranja pedindo pra ativar.
- Pra ligar ou desligar sons e notificações: clique na sua foto (embaixo, à esquerda).

**Seu perfil**
- Clique na sua foto (embaixo, à esquerda) → **Perfil**: troque o **apelido** (Enter salva) e a **foto** (qualquer imagem; ela é cortada redonda e fica leve sozinha). "Voltar pra foto do Google" desfaz a foto.
- Todo mundo vê o apelido e a foto novos na hora — até nas mensagens antigas.

**Amigos e mensagens diretas**
- O logo do Telão no topo da barra esquerda abre suas **conversas privadas**. Em cima delas fica **👥 Amigos**.
- **Mensagem direta é só entre amigos** (igual Discord).
- Pra adicionar alguém, qualquer um destes:
  - **Código de amigo:** Amigos → **Adicionar** mostra o seu código (6 letras/números, ex.: `K7P2QX`). Seu amigo digita ele lá no Telão dele.
  - **Link de amizade:** botão **Copiar link de amizade**. Quem abrir o link (e entrar com Google) já te manda o pedido.
  - **Pela lista de membros** de um servidor: clique na pessoa → **➕ Adicionar amigo**.
- O pedido aparece em **Pendentes** (com bolinha vermelha, som e notificação). ✓ aceita, ✕ recusa.
- Abas **Online** e **Todos** mostram seus amigos; 💬 abre a conversa; ⋯ → **Desfazer amizade**.
- Desfez a amizade? A conversa antiga continua aí pra ler, mas ninguém consegue mandar mensagem nova até virarem amigos de novo.
- Uma bolinha vermelha no logo avisa mensagem nova ou pedido de amizade.

**Voz**
- Embaixo à esquerda: 🎤 mutar · 🎧 ensurdecer · ⚙️ **configurações de voz**:
  - **Detecção de voz** (mic sempre aberto) ou **Apertar pra falar** (segure a tecla, padrão **V**; clique no botão da tecla pra trocar).
  - **Qualidade do áudio:** *Voz* (tira ruído e eco — melhor pra conversar) ou *Música* (som em alta qualidade, sem filtros — pra tocar instrumento ou música).
  - **Microfone:** escolha qual usar. A barra **Teste do microfone** mexe quando você fala — se não mexer, o problema é o microfone.
  - **Onde ouvir:** escolha a saída de áudio (fone, caixa de som, headset). **Testar** toca um "plim" nela. Funciona no Chrome e no Edge; no Safari/Firefox troque pelas configurações de som do sistema.
- Passe o mouse no quadrado de alguém pra mudar **só o volume daquela pessoa**.
- Apareceu a faixa vermelha **"Toque aqui pra ouvir"**? O navegador (principalmente no iPhone) pausou o som da call: é só tocar nela.
- Se o quadrado de alguém mostrar **"Conectando…"** por muito tempo ou **"⚠ Sem conexão"**, a rede de um de vocês está bloqueando a ligação: configure a **ponte (TURN)** (seção 4).
- **Assistir a live enquanto conversa:** se você sair do canal de voz pra um canal de texto (ou outro servidor), a live aparece num **quadrinho no canto**. Botões dele: ⧉ **janela flutuante** (a live fica por cima de tudo, até do jogo ou de outros programas), ⤢ voltar pra call, × esconder. Na tela grande da live também tem o botão **Janela flutuante**.
- 📷 câmera · 🖥️ **Transmitir** a tela (marque "Compartilhar áudio" pra mandar o som) · escolha 720p, 1080p 30 ou 1080p 60.
  - Aba do Chrome: som sempre funciona. Tela inteira no Windows: som do sistema funciona. Janela de jogo: use **Tela inteira** pra ter som.
- Clique na sua foto (embaixo) pra ficar **AFK** ou sair da conta. Depois de 10 min sem mexer, o site te marca AFK sozinho.

## 4. Limites (importante saber)

- **Compartilhar tela** só funciona no **computador** (Chrome, Edge ou Opera). No celular dá pra **assistir**, falar e usar a câmera, mas não transmitir a tela.
- A conexão é direta entre as pessoas (sem servidor de vídeo). Isso é grátis, mas **quem transmite manda uma cópia pra cada amigo**.
  Upload necessário de quem está em live, por pessoa assistindo:
  720p ≈ 2,5 Mbps · 1080p30 ≈ 4,5 Mbps · 1080p60 ≈ 7 Mbps.
  Câmera ≈ 1 Mbps por pessoa assistindo. Voz é bem leve.
  Ex.: 1080p60 pra 4 amigos ≈ 28 Mbps de upload. Ideal: até ~5–6 pessoas na sala.
- Se algum amigo entrar e **não ver a tela/não ouvir** (acontece em algumas redes de faculdade, empresa ou 4G), configure o **TURN** (veja abaixo). O site avisa quando não consegue conectar com alguém.
- O Firebase grátis aguenta tranquilo um grupo de amigos (o site grava pouca coisa: presença a cada 10 s durante a call, status a cada minuto, chat e os sinais de conexão).
- Imagens e arquivos ficam guardados dentro do próprio banco (por isso o limite de 700 KB). Pra arquivos grandes, mande um link do Google Drive.
- O convite é o link com o código do servidor: **quem tiver o link entra**. Mande só pra quem você quer. Se vazar, crie outro servidor.
- Excluir um servidor tira ele da lista de todo mundo, mas as mensagens antigas ficam guardadas no Firebase (dá pra apagar pelo console, em Firestore).

### Configurar o TURN (grátis, 5 minutos)

O TURN é uma "ponte" pra quando a rede de alguém não deixa a conexão direta. Sem ele, a call funciona na maioria das redes de casa; com ele, funciona em quase todas.

**1. Pegar a credencial na Metered**
1. Crie uma conta grátis em https://dashboard.metered.ca/signup.
2. No painel: **TURN Server → Create Credential** (região: deixe a que vier; se der erro, escolha *Standard*).
3. Clique na credencial e copie o **Username** e o **Password**.

**2. Colar no Telão (a senha NÃO vai pro código nem pro GitHub)**
1. Confirme que você publicou o `firestore.rules` novo (passo 1.4).
2. No Telão, clique na sua foto (embaixo, à esquerda) → quadro **Ponte de conexão (TURN)**.
3. Cole o **Username** e o **Password**, escolha a região (a mesma da Metered) e clique em **Salvar ponte**.
4. Pronto: quando alguém entra num canal de voz, o site busca a ponte sozinho.

- **Quem salvar primeiro vira o dono da ponte**: só essa pessoa vê o quadro e pode trocar a senha depois. Por isso faça isso logo depois de subir o site.
- A senha fica guardada no Firestore (`config/turn`).
- Só quem entrou com Google consegue ler, e só o dono consegue alterar (regra em `firestore.rules`).
- **Ninguém de fora vê a senha**, mas quem entra no Telão poderia achá-la pelo F12 — é assim com qualquer site que faz call direto do navegador. O pior que alguém pode fazer com ela é gastar sua cota grátis. Se o painel da Metered mostrar consumo estranho, apague a credencial, crie outra e salve a nova no mesmo quadro (não precisa mexer no código).
- Outras formas (API Key da Metered ou outro serviço de TURN) estão explicadas no comentário do `js/config.js`.

## 5. Funciona em quais aparelhos?

| | PC (Chrome, Edge, Opera, Brave) | PC (Firefox) | PC (Safari/Mac) | Android (Chrome, Samsung) | iPhone/iPad (Safari, Chrome) |
|---|---|---|---|---|---|
| Login, servidores, chat | ✅ | ✅ | ✅ | ✅ | ✅ |
| Call de voz e câmera | ✅ | ✅ | ✅ | ✅ | ✅ |
| Assistir lives | ✅ | ✅ | ✅ | ✅ | ✅ |
| Transmitir a tela | ✅ com som da aba/PC | ✅ sem som | ✅ sem som | ❌ | ❌ |
| Live no cantinho | ✅ | ✅ | ✅ | ✅ | ✅ |
| Janela flutuante | ✅ | ⚠️ pelo botão do próprio Firefox no vídeo | ✅ | ⚠️ depende do aparelho | ⚠️ depende da versão |
| Sons de aviso | ✅ | ✅ | ✅ | ✅ | ✅ (depois do primeiro toque na tela) |
| Instalar como app | ✅ Chrome/Edge | ❌ | ✅ | ✅ | ✅ (Compartilhar → Tela de Início) |
| Notificação do sistema | ✅ | ✅ | ✅ | ✅ | ✅ só no app instalado (iOS 16.4+) |

- **Celular não transmite tela** em nenhum site: Android e iPhone não deixam navegadores capturarem a tela. No celular o botão Transmitir some sozinho.
- No celular o site vira **3 abas** embaixo: Canais, Conversa (com contador de mensagens novas) e Membros.
- Durante a call o site pede pra **manter a tela do celular acesa**. Se o app for pra segundo plano, o iPhone pode pausar o áudio — volte pro navegador que ele retoma.
- **iPhone:** se não ouvir ninguém ao entrar, toque em qualquer lugar da tela (o iPhone exige um toque pra liberar o som).
- **Link aberto pelo WhatsApp/Instagram:** o Google bloqueia login dentro desses apps. Toque em ⋮ (ou compartilhar) → **Abrir no navegador**. O site avisa quando isso acontece.
- **Notificações no celular:** chegam enquanto o Telão está aberto ou em segundo plano recente. Com o app totalmente fechado (ou o celular economizando bateria) elas não chegam — pra isso seria preciso um servidor de "push", que no Firebase só existe no plano pago.
- Navegadores muito antigos (antes de 2021) podem não funcionar — basta atualizar.

## 6. Se algo der errado

- Aperte **F12 → Console** e veja a mensagem em vermelho.
- `auth/operation-not-allowed`: faltou ativar o login com Google (passo 1.2).
- `auth/popup-blocked`: o navegador bloqueou a janelinha do Google — o site tenta de novo pelo redirecionamento; se não der, libere pop-ups pro site.
- `permission-denied`: as regras do passo 1.4 não foram publicadas.
- `auth/unauthorized-domain`: faltou o passo 2.4.

## 7. Padrão Zart e leis (LGPD, CDC, acessibilidade)

- **Identidade:** nome "Zart Telão", logo ZART com a coroa + "Telão" no cabeçalho, favicon da coroa com o Z, cores azul meia-noite (#191970), azul escuro (#0b1440) e preto. Rodapé: "Um projeto do grupo Zart."
- **Páginas legais:** `privacidade.html`, `termos.html`, `cookies.html`, `reembolso.html` (ligadas no rodapé do login, das páginas e na janela "Sua conta").
- **Aceite:** o login só funciona marcando "Tenho 18 anos ou mais e li e concordo…". O aceite fica salvo no perfil (`usuarios/{uid}.consentimento` = versão, data, 18+). Se os termos mudarem, troque `VERSAO_TERMOS` em `js/auth.js` e todo mundo aceita de novo.
- **Cookies:** só armazenamento essencial. O aviso de cookies tem Aceitar/Recusar e pode ser reaberto em "Preferências de cookies". Se um dia quiser Google Analytics, ponha o ID em `ANALYTICS_ID` (`js/config.js`): ele só carrega pra quem aceitar — e atualize `cookies.html` antes.
- **Direitos do titular (LGPD art. 18):** em Sua conta → "Baixar meus dados" (arquivo JSON) e "Excluir minha conta" (apaga perfil, código, amizades, mensagens da pessoa, servidores dos quais ela é dona e a conta de login). Pedidos por e-mail: projetozart@gmail.com.
- **Acessibilidade:** link "Pular para o conteúdo", títulos em ordem, rótulos em todos os campos, foco visível, menus com teclado (setas e Esc), contraste mínimo 4,5:1 nos textos.
