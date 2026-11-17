/**
 * chat.js — Chat genérico (canal de texto ou conversa direta):
 * mensagens, reações, responder, fixar, editar, apagar, imagens, arquivos,
 * avisos de sistema, "fulano está digitando" e busca.
 */
import { doc, addDoc, setDoc, updateDoc, deleteDoc, getDocs, onSnapshot, query, orderBy, limitToLast } from "./firebase.js";
import { S, parar } from "./estado.js";
import { LIMITES, REACOES_RAPIDAS } from "./config.js";
import {
  $, cor, criarAvatar, dataCurta, aviso, doModelo, textoRico, comprimirImagem, lerArquivo,
  tamanhoLegivel, menuFlutuante, confirmar,
} from "./util.js";
import { ehCelular } from "./compat.js";
import { pode, cargoDe } from "./permissoes.js";
import { perfil } from "./perfis.js";
import { abrirSeletorEmoji } from "./emoji.js";
import { abaAtual, contarNaoLidas, renderTudo } from "./ui.js";
import { estouVendo } from "./avisos.js";

const AGRUPAR_MS = 5 * 60 * 1000; // mensagens seguidas da mesma pessoa em 5 min ficam juntas
let idxFixada = 0;
let fixadasOcultas = null;
let rascunhoEdicao = null;     // texto que estou editando (sobrevive se chegar mensagem nova)
let irParaDepois = null;       // id da mensagem pra rolar até, depois de carregar mais histórico

/* ------------------------------------------------------------ abrir / fechar */

/**
 * Abre um chat.
 * @param {{chave:string, colecao:Function, titulo:string, contexto:"canal"|"dm"}} opcoes
 */
export function abrirChat(opcoes) {
  if (S.chat?.chave === opcoes.chave) return;
  fecharChat();
  S.chat = { ...opcoes, limite: LIMITES.mensagensNoChat, historico: null };
  idxFixada = 0;
  $("mensagens").replaceChildren();
  $("tituloChat").textContent = opcoes.titulo;
  ouvirMensagens();
  ouvirDigitando();
  cancelarResposta();
  renderTudo();
}

/** (Re)liga o ouvinte das mensagens com o limite atual (a busca pode aumentar o limite). */
function ouvirMensagens() {
  parar("chat");
  const chat = S.chat;
  const q = query(chat.colecao(), orderBy("ts"), limitToLast(chat.limite));
  let primeiraVez = true;
  S.parar.chat = onSnapshot(q, snap => {
    if (S.chat !== chat) return;
    const novas = snap.docChanges().filter(c => c.type === "added" && c.doc.data().uid !== S.user.uid).length;
    if (!primeiraVez && novas && ehCelular() && abaAtual() !== "conversa") contarNaoLidas(novas);
    primeiraVez = false;
    S.mensagens = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMensagens();
    renderFixadas();
    if (irParaDepois && S.mensagens.some(m => m.id === irParaDepois)) {
      const id = irParaDepois;
      irParaDepois = null;
      setTimeout(() => irParaMensagem(id), 50);
    }
    if (estouVendo()) chat.aoVer?.();
  }, erro => aviso("Erro no chat: " + erro.code));
}

export function fecharChat() {
  parar("chat");
  parar("digitando");
  pararDeDigitar();
  clearInterval(timerDigitando);
  if (S.chat) fecharBusca();
  S.chat = null;
  S.mensagens = [];
  S.editando = null;
  cancelarResposta();
}

/** Resumo de uma mensagem pros avisos (quem mandou, começo do texto e quem foi marcado). */
export function resumoParaAviso(m, membros) {
  const texto = (m.texto || "").toLowerCase();
  const mencoes = membros.filter(uid => uid !== m.uid && texto.includes("@" + perfil(uid).nome.split(" ")[0].toLowerCase()));
  return {
    uid: m.uid, nome: m.nome, ts: m.ts, mencoes, todos: /@todos\b/.test(texto),
    texto: (m.texto || (m.imagem ? "📷 imagem" : "📎 arquivo")).slice(0, 120),
  };
}

/* ------------------------------------------------------------ permissões no chat atual */

const ehCanal = () => S.chat?.contexto === "canal";
const possoFixar = () => !ehCanal() || pode("fixar");
const possoApagar = m => m.uid === S.user.uid || (ehCanal() && pode("apagarMensagens"));
const possoEnviarArquivos = () => !ehCanal() || pode("enviarArquivos");
const possoEditar = m => m.uid === S.user.uid && m.tipo !== "sistema" && !!m.texto;
const refMensagem = id => doc(S.chat.colecao(), id);

/* ------------------------------------------------------------ desenho */

function nomesMencionaveis() {
  if (ehCanal()) return (S.servidores.get(S.atual)?.membros || []).map(uid => perfil(uid).nome.split(" ")[0]);
  return [S.nome.split(" ")[0]];
}

function renderMensagens() {
  const lista = $("mensagens");
  const estavaNoFim = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 120;
  const nomes = nomesMencionaveis();

  let anterior = null;
  const itens = S.mensagens.map(m => {
    const junta = anterior && anterior.uid === m.uid && m.tipo !== "sistema" && anterior.tipo !== "sistema"
      && !m.respondendo && m.ts - anterior.ts < AGRUPAR_MS;
    anterior = m;
    return m.tipo === "sistema" ? criarAvisoSistema(m) : criarMensagem(m, junta, nomes);
  });
  lista.replaceChildren(...itens);

  if (!S.mensagens.length) {
    const vazio = document.createElement("li");
    vazio.className = "chat__vazio";
    vazio.textContent = "Nenhuma mensagem ainda. Diga oi! 👋";
    lista.append(vazio);
  }
  if (estavaNoFim) lista.scrollTop = lista.scrollHeight;
}

function criarAvisoSistema(m) {
  const li = document.createElement("li");
  li.className = "msg-sistema";
  li.dataset.id = m.id;
  const hora = document.createElement("time");
  hora.className = "msg__hora";
  hora.textContent = dataCurta(m.ts);
  li.append("➜ " + m.texto + " ", hora);
  return li;
}

function criarMensagem(m, junta, nomes) {
  const li = doModelo("modeloMensagem");
  li.dataset.id = m.id;
  li.classList.toggle("msg--continuacao", !!junta);
  li.classList.toggle("msg--fixada", !!m.fixada);
  const meuPrimeiroNome = S.nome.split(" ")[0].toLowerCase();
  const meMencionou = /@todos\b/i.test(m.texto || "") || (m.texto || "").toLowerCase().includes("@" + meuPrimeiroNome);
  li.classList.toggle("msg--mencao", meMencionou && m.uid !== S.user.uid);

  li.prepend(criarAvatar(m.nome, m.foto, { classe: "avatar msg__avatar" }));
  const autor = li.querySelector(".msg__autor");
  autor.textContent = m.nome;
  autor.style.color = cor(m.nome);
  if (ehCanal()) {
    const cargo = cargoDe(m.uid);
    const selo = li.querySelector(".msg__cargo");
    if (cargo !== "membro") { selo.hidden = false; selo.textContent = { dono: "Dono", admin: "Admin", mod: "Mod" }[cargo]; selo.dataset.cargo = cargo; }
  }
  const hora = li.querySelector(".msg__hora");
  hora.textContent = dataCurta(m.ts);
  hora.dateTime = new Date(m.ts).toISOString();

  if (m.respondendo) {
    const ref = li.querySelector(".msg__resposta");
    ref.hidden = false;
    ref.querySelector(".msg__resposta-autor").textContent = m.respondendo.nome;
    ref.querySelector(".msg__resposta-texto").textContent = m.respondendo.texto || "📎 anexo";
    ref.addEventListener("click", () => irParaMensagemCarregando(m.respondendo.id));
  }
  const caixaTexto = li.querySelector(".msg__texto");
  if (S.editando === m.id) caixaTexto.append(criarEditor(m));
  else if (m.texto) {
    caixaTexto.append(textoRico(m.texto, nomes));
    if (m.editada) {
      const marca = document.createElement("span");
      marca.className = "msg__editada";
      marca.textContent = " (editada)";
      marca.title = "Editada em " + dataCurta(m.editada);
      caixaTexto.append(marca);
    }
  } else caixaTexto.remove();

  if (m.imagem) {
    const img = document.createElement("img");
    img.className = "msg__imagem";
    img.src = m.imagem;
    img.alt = m.imagemNome ? `Imagem: ${m.imagemNome}` : `Imagem enviada por ${m.nome}`;
    img.loading = "lazy";
    img.addEventListener("click", () => abrirImagem(m.imagem, img.alt));
    li.querySelector(".msg__anexo").append(img);
  }
  if (m.arquivo) {
    const a = document.createElement("a");
    a.className = "msg__arquivo";
    a.href = m.arquivo.dados;
    a.download = m.arquivo.nome;
    a.textContent = `📎 ${m.arquivo.nome} (${tamanhoLegivel(m.arquivo.tamanho)})`;
    li.querySelector(".msg__anexo").append(a);
  }

  renderReacoes(li.querySelector(".msg__reacoes"), m);
  ligarAcoes(li, m);
  return li;
}

function renderReacoes(caixa, m) {
  const reacoes = Object.entries(m.reacoes || {}).filter(([, uids]) => uids?.length);
  caixa.hidden = !reacoes.length;
  for (const [emoji, uids] of reacoes) {
    const bt = document.createElement("button");
    bt.type = "button";
    bt.className = "reacao";
    bt.classList.toggle("reacao--minha", uids.includes(S.user.uid));
    bt.textContent = `${emoji} ${uids.length}`;
    bt.title = uids.map(uid => perfil(uid).nome).join(", ");
    bt.setAttribute("aria-label", `${emoji}: ${uids.length}. Clique pra reagir`);
    bt.addEventListener("click", () => alternarReacao(m, emoji));
    caixa.append(bt);
  }
}

function ligarAcoes(li, m) {
  li.querySelector(".msg__reagir").addEventListener("click", e =>
    abrirSeletorEmoji(e.currentTarget, emoji => alternarReacao(m, emoji), { rapidas: REACOES_RAPIDAS }));
  li.querySelector(".msg__responder").addEventListener("click", () => responder(m));
  const mais = li.querySelector(".msg__mais");
  const opcoes = [];
  if (possoEditar(m)) opcoes.push({ rotulo: "Editar", acao: () => comecarEdicao(m) });
  if (possoFixar()) opcoes.push({ rotulo: m.fixada ? "Desafixar" : "Fixar mensagem", acao: () => alternarFixada(m) });
  if (m.texto) opcoes.push({ rotulo: "Copiar texto", acao: () => navigator.clipboard?.writeText(m.texto).then(() => aviso("Copiado!")) });
  if (possoApagar(m)) opcoes.push({ rotulo: "Apagar", acao: () => apagarMensagem(m), perigo: true });
  if (!opcoes.length) mais.remove();
  else mais.addEventListener("click", () => menuFlutuante(mais, opcoes));
}

/* ------------------------------------------------------------ fixadas */

function renderFixadas() {
  const fixadas = S.mensagens.filter(m => m.fixada);
  const barra = $("barraFixadas");
  barra.hidden = !fixadas.length || fixadasOcultas === S.chat?.chave;
  if (barra.hidden) return;
  idxFixada = Math.min(idxFixada, fixadas.length - 1);
  const m = fixadas[fixadas.length - 1 - idxFixada]; // mais recente primeiro
  $("fixadaAutor").textContent = m.nome;
  $("fixadaTexto").textContent = m.texto || "📎 anexo";
  $("fixadaContador").textContent = `${idxFixada + 1}/${fixadas.length}`;
  $("btFixadaAnterior").disabled = idxFixada >= fixadas.length - 1;
  $("btFixadaProxima").disabled = idxFixada <= 0;
  $("fixadaConteudo").onclick = () => irParaMensagemCarregando(m.id);
}

function irParaMensagem(id) {
  const el = $("mensagens").querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!el) return aviso("Essa mensagem é antiga e não está carregada.");
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("msg--destaque");
  setTimeout(() => el.classList.remove("msg--destaque"), 1600);
}

/* ------------------------------------------------------------ ações */

async function alternarReacao(m, emoji) {
  const reacoes = structuredClone(m.reacoes || {});
  const uids = new Set(reacoes[emoji] || []);
  uids.has(S.user.uid) ? uids.delete(S.user.uid) : uids.add(S.user.uid);
  if (uids.size) reacoes[emoji] = [...uids]; else delete reacoes[emoji];
  await updateDoc(refMensagem(m.id), { reacoes }).catch(() => aviso("Não deu pra reagir."));
}

async function alternarFixada(m) {
  await updateDoc(refMensagem(m.id), { fixada: !m.fixada })
    .then(() => aviso(m.fixada ? "Mensagem desafixada." : "📌 Mensagem fixada!"))
    .catch(() => aviso("Você não tem permissão pra fixar."));
  fixadasOcultas = null;
}

async function apagarMensagem(m) {
  if (!await confirmar("Ela some pra todo mundo.", { titulo: "Apagar mensagem?", botao: "Apagar" })) return;
  await deleteDoc(refMensagem(m.id)).catch(() => aviso("Não deu pra apagar."));
}

/* ------------------------------------------------------------ editar */

function comecarEdicao(m) {
  S.editando = m.id;
  rascunhoEdicao = m.texto;
  renderMensagens();
}

function cancelarEdicao() {
  S.editando = null;
  rascunhoEdicao = null;
  renderMensagens();
  $("campoMensagem").focus();
}

async function salvarEdicao(m, texto) {
  texto = texto.trim().slice(0, LIMITES.tamanhoMensagem);
  if (!texto || texto === m.texto) return cancelarEdicao();
  S.editando = null;
  rascunhoEdicao = null;
  await updateDoc(refMensagem(m.id), { texto, editada: Date.now() }).catch(() => aviso("Não deu pra editar."));
  renderMensagens();
}

/** Caixa de edição no lugar do texto da mensagem. */
function criarEditor(m) {
  const caixa = document.createElement("div");
  caixa.className = "msg__edicao";
  const campo = document.createElement("textarea");
  campo.className = "campo msg__editor";
  campo.maxLength = LIMITES.tamanhoMensagem;
  campo.value = rascunhoEdicao ?? m.texto;
  campo.setAttribute("aria-label", "Editar mensagem");
  campo.addEventListener("input", () => { rascunhoEdicao = campo.value; });
  campo.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); salvarEdicao(m, campo.value); }
    if (e.key === "Escape") { e.preventDefault(); cancelarEdicao(); }
  });
  const dica = document.createElement("p");
  dica.className = "msg__dica";
  dica.innerHTML = `Enter <button type="button" class="botao-texto" data-editar="salvar">salva</button> · Esc <button type="button" class="botao-texto" data-editar="cancelar">cancela</button>`;
  dica.querySelector('[data-editar="salvar"]').addEventListener("click", () => salvarEdicao(m, campo.value));
  dica.querySelector('[data-editar="cancelar"]').addEventListener("click", cancelarEdicao);
  caixa.append(campo, dica);
  requestAnimationFrame(() => {
    if (document.activeElement === campo) return;
    campo.focus();
    campo.selectionStart = campo.selectionEnd = campo.value.length;
  });
  return caixa;
}

/* ------------------------------------------------------------ "está digitando" */

const digitandoAgora = new Map(); // uid -> { nome, chegou } (hora local em que soube)
let ultimoSinalDigitando = 0;
let timerDigitando = null;

function ouvirDigitando() {
  digitandoAgora.clear();
  renderDigitando();
  const chat = S.chat;
  if (!chat.digitando) return;
  S.parar.digitando = onSnapshot(chat.digitando(), snap => {
    if (S.chat !== chat) return;
    for (const mudanca of snap.docChanges()) {
      const uid = mudanca.doc.id;
      const d = mudanca.doc.data();
      // ignora sinais antigos (alguém que fechou a aba digitando); 60 s de folga pro relógio de cada PC
      if (mudanca.type === "removed" || uid === S.user.uid || Math.abs(Date.now() - d.ts) > 60_000) digitandoAgora.delete(uid);
      else digitandoAgora.set(uid, { nome: d.nome, chegou: Date.now() });
    }
    renderDigitando();
  }, () => {});
  timerDigitando = setInterval(renderDigitando, 1000);
}

function renderDigitando() {
  const limite = Date.now() - LIMITES.digitandoExpiraMs;
  for (const [uid, d] of digitandoAgora) if (d.chegou < limite) digitandoAgora.delete(uid);
  const nomes = [...digitandoAgora.values()].map(d => d.nome.split(" ")[0]);
  const el = $("digitando");
  el.textContent =
    !nomes.length ? "" :
    nomes.length === 1 ? `${nomes[0]} está digitando…` :
    nomes.length <= 3 ? `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)} estão digitando…` :
    "Várias pessoas estão digitando…";
  el.classList.toggle("digitando--ativo", nomes.length > 0);
}

/** Avisa que estou digitando (no máximo a cada 3 s, pra gastar pouco). */
function sinalizarDigitando() {
  if (!S.chat?.digitando || !$("campoMensagem").value.trim()) return pararDeDigitar();
  if (Date.now() - ultimoSinalDigitando < LIMITES.digitandoMs) return;
  ultimoSinalDigitando = Date.now();
  setDoc(doc(S.chat.digitando(), S.user.uid), { nome: S.nome, ts: Date.now() }).catch(() => {});
}

function pararDeDigitar() {
  if (!ultimoSinalDigitando || !S.chat?.digitando) return;
  ultimoSinalDigitando = 0;
  deleteDoc(doc(S.chat.digitando(), S.user.uid)).catch(() => {});
}

/* ------------------------------------------------------------ buscar */

const normalizar = t => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
let timerBusca = null;

function abrirBusca() {
  $("barraBusca").hidden = false;
  $("btBuscar").setAttribute("aria-pressed", "true");
  $("campoBusca").focus();
  $("campoBusca").select();
}

function fecharBusca() {
  $("barraBusca").hidden = true;
  $("btBuscar").setAttribute("aria-pressed", "false");
  $("campoBusca").value = "";
  $("resultadosBusca").hidden = true;
  $("mensagens").hidden = false;
}

/** Baixa as mensagens antigas uma vez (até 1000) pra buscar nelas. */
async function carregarHistorico() {
  const chat = S.chat;
  if (chat.historico) return chat.historico;
  $("contagemBusca").textContent = "Carregando…";
  const snap = await getDocs(query(chat.colecao(), orderBy("ts"), limitToLast(LIMITES.buscaMaxMensagens)));
  chat.historico = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return chat.historico;
}

async function buscar() {
  const termo = normalizar($("campoBusca").value.trim());
  const lista = $("resultadosBusca");
  if (!termo) {
    lista.hidden = true;
    $("mensagens").hidden = false;
    $("contagemBusca").textContent = "";
    return;
  }
  const chat = S.chat;
  let historico;
  try { historico = await carregarHistorico(); }
  catch { return aviso("Não deu pra buscar agora."); }
  if (S.chat !== chat) return;

  // junta o histórico com as mensagens que chegaram depois (as mais novas valem)
  const todas = new Map(historico.map(m => [m.id, m]));
  for (const m of S.mensagens) todas.set(m.id, m);
  const achadas = [...todas.values()]
    .filter(m => m.tipo !== "sistema")
    .filter(m => normalizar(m.texto).includes(termo) || normalizar(m.nome).includes(termo) || normalizar(m.arquivo?.nome || m.imagemNome).includes(termo))
    .sort((a, b) => b.ts - a.ts);

  $("contagemBusca").textContent = achadas.length ? `${achadas.length} ${achadas.length > 1 ? "resultados" : "resultado"}` : "Nada encontrado";
  lista.replaceChildren(...achadas.slice(0, 100).map(m => criarResultado(m, termo)));
  lista.hidden = false;
  $("mensagens").hidden = true;
}

function criarResultado(m, termo) {
  const li = document.createElement("li");
  const bt = document.createElement("button");
  bt.type = "button";
  bt.className = "resultado";
  const topo = document.createElement("span");
  topo.className = "resultado__topo";
  const nome = document.createElement("strong");
  nome.textContent = m.nome;
  nome.style.color = cor(m.nome);
  const hora = document.createElement("time");
  hora.className = "msg__hora";
  hora.textContent = dataCurta(m.ts);
  topo.append(nome, " ", hora);
  const trecho = document.createElement("span");
  trecho.className = "resultado__texto";
  trecho.append(...destacar(m.texto || (m.imagem ? "📷 imagem" : "📎 " + (m.arquivo?.nome || "arquivo")), termo));
  bt.append(topo, trecho);
  bt.addEventListener("click", () => { fecharBusca(); irParaMensagemCarregando(m.id); });
  li.append(bt);
  return li;
}

/** Quebra o texto e põe <mark> onde o termo aparece (sem acento/maiúscula fazer diferença). */
function destacar(texto, termo) {
  const base = normalizar(texto);
  const partes = [];
  let i = 0;
  for (let achou = base.indexOf(termo); achou !== -1 && partes.length < 20; achou = base.indexOf(termo, i)) {
    partes.push(texto.slice(i, achou));
    const mark = document.createElement("mark");
    mark.textContent = texto.slice(achou, achou + termo.length);
    partes.push(mark);
    i = achou + termo.length;
  }
  partes.push(texto.slice(i));
  return partes;
}

/** Vai até uma mensagem; se for antiga, carrega mais histórico antes. */
async function irParaMensagemCarregando(id) {
  if (S.mensagens.some(m => m.id === id)) return irParaMensagem(id);
  if (!S.chat) return;
  const historico = await carregarHistorico().catch(() => []);
  const posicao = historico.findIndex(m => m.id === id);
  if (posicao === -1) return aviso("Essa mensagem não está mais aqui.");
  irParaDepois = id;
  S.chat.limite = Math.min(LIMITES.buscaMaxMensagens, historico.length - posicao + 20);
  ouvirMensagens();
}

/* ------------------------------------------------------------ responder */

function responder(m) {
  S.respondendo = { id: m.id, nome: m.nome, texto: (m.texto || "").slice(0, 120) };
  $("respostaAutor").textContent = m.nome;
  $("respostaTexto").textContent = m.texto || "📎 anexo";
  $("barraResposta").hidden = false;
  $("campoMensagem").focus();
}

function cancelarResposta() {
  S.respondendo = null;
  const barra = $("barraResposta");
  if (barra) barra.hidden = true;
}

function abrirImagem(src, alt) {
  $("imagemGrande").src = src;
  $("imagemGrande").alt = alt;
  $("dlgImagem").showModal();
}

/* ------------------------------------------------------------ enviar */

async function enviar(extra = {}) {
  if (!S.chat) return;
  const campo = $("campoMensagem");
  const texto = campo.value.trim().slice(0, LIMITES.tamanhoMensagem);
  if (!texto && !extra.imagem && !extra.arquivo) return;
  pararDeDigitar();
  const mensagem = { uid: S.user.uid, nome: S.nome, foto: S.foto, texto, ts: Date.now(), reacoes: {}, fixada: false, ...extra };
  if (S.respondendo) mensagem.respondendo = S.respondendo;
  campo.value = "";
  ajustarAltura();
  cancelarResposta();
  const chat = S.chat;
  try {
    await addDoc(chat.colecao(), mensagem);
    chat.aoEnviar?.(mensagem);
  } catch (erro) {
    aviso(erro.code === "permission-denied" ? "Você não tem permissão pra isso aqui." : "Mensagem não enviada.");
  }
}

/** Manda uma imagem (comprimida) ou um arquivo pequeno. */
async function enviarArquivo(arquivo) {
  if (!arquivo) return;
  if (!possoEnviarArquivos()) return aviso("Seu cargo não pode enviar arquivos neste servidor.");
  try {
    if (arquivo.type.startsWith("image/")) {
      aviso("Enviando imagem…");
      const imagem = await comprimirImagem(arquivo, LIMITES.imagemLado, LIMITES.imagemQualidade);
      if (imagem.length > 950_000) return aviso("Imagem grande demais, mesmo comprimida.");
      return enviar({ imagem, imagemNome: arquivo.name });
    }
    if (arquivo.size > LIMITES.arquivoMaxBytes) return aviso(`Arquivo muito grande (máx. ${tamanhoLegivel(LIMITES.arquivoMaxBytes)}).`);
    const dados = await lerArquivo(arquivo);
    return enviar({ arquivo: { nome: arquivo.name.slice(0, 100), tamanho: arquivo.size, dados } });
  } catch {
    aviso("Não deu pra ler esse arquivo.");
  }
}

function ajustarAltura() {
  const campo = $("campoMensagem");
  campo.style.height = "auto";
  campo.style.height = Math.min(campo.scrollHeight, 160) + "px";
}

export function iniciarChat() {
  const campo = $("campoMensagem");
  $("formChat").addEventListener("submit", e => { e.preventDefault(); enviar(); });
  campo.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); enviar(); }
    if (e.key === "Escape") cancelarResposta();
    // seta pra cima com o campo vazio: editar minha última mensagem
    if (e.key === "ArrowUp" && !campo.value) {
      const minha = [...S.mensagens].reverse().find(possoEditar);
      if (minha) { e.preventDefault(); comecarEdicao(minha); }
    }
  });
  campo.addEventListener("input", () => { ajustarAltura(); sinalizarDigitando(); });
  campo.addEventListener("blur", () => { if (!campo.value.trim()) pararDeDigitar(); });

  $("btBuscar").addEventListener("click", () => ($("barraBusca").hidden ? abrirBusca() : fecharBusca()));
  $("btFecharBusca").addEventListener("click", fecharBusca);
  $("campoBusca").addEventListener("input", () => { clearTimeout(timerBusca); timerBusca = setTimeout(buscar, 250); });
  $("campoBusca").addEventListener("keydown", e => { if (e.key === "Escape") fecharBusca(); });
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && S.chat && !$("painelChat").hidden) { e.preventDefault(); abrirBusca(); }
  });
  campo.addEventListener("paste", e => {
    const arquivo = [...(e.clipboardData?.files || [])][0];
    if (arquivo) { e.preventDefault(); enviarArquivo(arquivo); }
  });
  $("btAnexo").addEventListener("click", () => $("entradaArquivo").click());
  $("entradaArquivo").addEventListener("change", e => { enviarArquivo(e.target.files[0]); e.target.value = ""; });
  $("btEmojiChat").addEventListener("click", e => abrirSeletorEmoji(e.currentTarget, emoji => {
    const i = campo.selectionStart ?? campo.value.length;
    campo.value = campo.value.slice(0, i) + emoji + campo.value.slice(i);
    campo.focus();
    campo.selectionStart = campo.selectionEnd = i + emoji.length;
  }));
  $("btCancelarResposta").addEventListener("click", cancelarResposta);
  $("btFixadaAnterior").addEventListener("click", () => { idxFixada++; renderFixadas(); });
  $("btFixadaProxima").addEventListener("click", () => { idxFixada--; renderFixadas(); });
  $("btFecharFixadas").addEventListener("click", () => { fixadasOcultas = S.chat?.chave; renderFixadas(); });
  $("btVerFixadas").addEventListener("click", () => { fixadasOcultas = null; renderFixadas(); if ($("barraFixadas").hidden) aviso("Nenhuma mensagem fixada aqui."); });

  // arrastar arquivo pra dentro do chat
  const area = $("painelChat");
  area.addEventListener("dragover", e => { e.preventDefault(); area.classList.add("painel-chat--soltar"); });
  area.addEventListener("dragleave", () => area.classList.remove("painel-chat--soltar"));
  area.addEventListener("drop", e => { e.preventDefault(); area.classList.remove("painel-chat--soltar"); enviarArquivo(e.dataTransfer.files[0]); });
}
