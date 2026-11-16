/**
 * chat.js — Chat genérico (canal de texto ou conversa direta):
 * mensagens, reações, responder, fixar, imagens, arquivos, avisos de sistema e apagar.
 */
import { doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, limitToLast } from "./firebase.js";
import { S, parar } from "./estado.js";
import { LIMITES, REACOES_RAPIDAS } from "./config.js";
import {
  $, cor, criarAvatar, dataCurta, aviso, doModelo, textoRico, comprimirImagem, lerArquivo,
  tamanhoLegivel, menuFlutuante,
} from "./util.js";
import { ehCelular } from "./compat.js";
import { pode, cargoDe } from "./permissoes.js";
import { perfil } from "./perfis.js";
import { abrirSeletorEmoji } from "./emoji.js";
import { abaAtual, contarNaoLidas, renderTudo } from "./ui.js";

const AGRUPAR_MS = 5 * 60 * 1000; // mensagens seguidas da mesma pessoa em 5 min ficam juntas
let idxFixada = 0;
let fixadasOcultas = null;

/* ------------------------------------------------------------ abrir / fechar */

/**
 * Abre um chat.
 * @param {{chave:string, colecao:Function, titulo:string, contexto:"canal"|"dm"}} opcoes
 */
export function abrirChat(opcoes) {
  if (S.chat?.chave === opcoes.chave) return;
  fecharChat();
  S.chat = opcoes;
  idxFixada = 0;
  $("mensagens").replaceChildren();
  $("tituloChat").textContent = opcoes.titulo;

  const q = query(opcoes.colecao(), orderBy("ts"), limitToLast(LIMITES.mensagensNoChat));
  let primeiraVez = true;
  S.parar.chat = onSnapshot(q, snap => {
    if (S.chat?.chave !== opcoes.chave) return;
    const novas = snap.docChanges().filter(c => c.type === "added" && c.doc.data().uid !== S.user.uid).length;
    if (!primeiraVez && novas && ehCelular() && abaAtual() !== "conversa") contarNaoLidas(novas);
    primeiraVez = false;
    S.mensagens = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMensagens();
    renderFixadas();
  }, erro => aviso("Erro no chat: " + erro.code));
  cancelarResposta();
  renderTudo();
}

export function fecharChat() {
  parar("chat");
  S.chat = null;
  S.mensagens = [];
  cancelarResposta();
}

/* ------------------------------------------------------------ permissões no chat atual */

const ehCanal = () => S.chat?.contexto === "canal";
const possoFixar = () => !ehCanal() || pode("fixar");
const possoApagar = m => m.uid === S.user.uid || (ehCanal() && pode("apagarMensagens"));
const possoEnviarArquivos = () => !ehCanal() || pode("enviarArquivos");
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
    ref.addEventListener("click", () => irParaMensagem(m.respondendo.id));
  }
  if (m.texto) li.querySelector(".msg__texto").append(textoRico(m.texto, nomes));
  else li.querySelector(".msg__texto").remove();

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
  $("fixadaConteudo").onclick = () => irParaMensagem(m.id);
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
  if (!confirm("Apagar esta mensagem?")) return;
  await deleteDoc(refMensagem(m.id)).catch(() => aviso("Não deu pra apagar."));
}

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
  });
  campo.addEventListener("input", ajustarAltura);
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
