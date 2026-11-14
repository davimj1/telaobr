/**
 * chat.js — Mensagens de texto do servidor.
 */
import { addDoc, onSnapshot, query, orderBy, limitToLast, srvCol } from "./firebase.js";
import { S } from "./estado.js";
import { LIMITES } from "./config.js";
import { $, cor, criarAvatar, dataCurta, aviso, doModelo } from "./util.js";
import { ehCelular } from "./compat.js";
import { abaAtual, contarNaoLidas } from "./ui.js";

/** Mensagens seguidas da mesma pessoa em até 5 min aparecem agrupadas. */
const AGRUPAR_MS = 5 * 60 * 1000;

/** Ouve as últimas mensagens do servidor em tempo real. */
export function ouvirChat(sid) {
  const q = query(srvCol(sid, "mensagens"), orderBy("ts"), limitToLast(LIMITES.mensagensNoChat));
  let primeiraVez = true;

  S.pararChat = onSnapshot(q, snap => {
    if (sid !== S.atual) return;

    const novasDeOutros = snap.docChanges()
      .filter(c => c.type === "added" && c.doc.data().uid !== S.user.uid).length;
    if (!primeiraVez && novasDeOutros && ehCelular() && abaAtual() !== "chat") contarNaoLidas(novasDeOutros);
    primeiraVez = false;

    renderMensagens(snap.docs.map(d => d.data()));
  }, erro => aviso("Erro no chat: " + erro.code));
}

export function pararChat() {
  S.pararChat?.();
  S.pararChat = null;
}

/** Desenha a lista de mensagens, mantendo a rolagem no fim se a pessoa já estava lá. */
function renderMensagens(mensagens) {
  const lista = $("mensagens");
  const estavaNoFim = lista.scrollHeight - lista.scrollTop - lista.clientHeight < 80;

  let anterior = null;
  const itens = mensagens.map(m => {
    const continuacao = anterior && anterior.uid === m.uid && m.ts - anterior.ts < AGRUPAR_MS;
    anterior = m;
    return criarMensagem(m, continuacao);
  });
  lista.replaceChildren(...itens);

  if (!mensagens.length) {
    const vazio = document.createElement("li");
    vazio.className = "chat__vazio";
    vazio.textContent = "Nenhuma mensagem ainda. Diga oi!";
    lista.append(vazio);
  }
  if (estavaNoFim) lista.scrollTop = lista.scrollHeight;
}

/** Monta uma mensagem a partir do <template id="modeloMensagem">. */
function criarMensagem(m, continuacao) {
  const li = doModelo("modeloMensagem");
  li.classList.toggle("msg--continuacao", continuacao);
  li.prepend(criarAvatar(m.nome, m.foto, { classe: "avatar msg__avatar" }));
  const autor = li.querySelector(".msg__autor");
  autor.textContent = m.nome;
  autor.style.color = cor(m.nome);
  const hora = li.querySelector(".msg__hora");
  hora.textContent = dataCurta(m.ts);
  hora.dateTime = new Date(m.ts).toISOString();
  li.querySelector(".msg__texto").textContent = m.texto;
  return li;
}

async function enviarMensagem(evento) {
  evento.preventDefault();
  const campo = $("campoMensagem");
  const texto = campo.value.trim();
  if (!texto || !S.atual) return;
  campo.value = "";
  await addDoc(srvCol(S.atual, "mensagens"), {
    uid: S.user.uid, nome: S.nome, foto: S.foto,
    texto: texto.slice(0, LIMITES.tamanhoMensagem), ts: Date.now(),
  }).catch(() => aviso("Mensagem não enviada."));
}

export function iniciarChat() {
  $("formChat").addEventListener("submit", enviarMensagem);
}
