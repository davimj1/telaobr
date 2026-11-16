/**
 * membros.js — Lista de membros (por cargo e status), ações de moderação
 * e a janela de configurações do servidor (geral, permissões, banidos).
 */
import { updateDoc, arrayRemove, arrayUnion, srvDoc } from "./firebase.js";
import { S, servidorAtual } from "./estado.js";
import { CARGOS, PERMISSOES, LIMITES } from "./config.js";
import { $, criarAvatar, aviso, menuFlutuante, esc } from "./util.js";
import { cargoDe, meuCargo, pode, possoAgirSobre, cargosQuePossoDar, permissoesDoCargo } from "./permissoes.js";
import { perfil, statusDe } from "./perfis.js";
import { abrirDm } from "./dm.js";
import { excluirServidor, sairDoServidor } from "./servidores.js";

/* ------------------------------------------------------------ lista de membros */

export function renderMembros() {
  const painel = $("listaMembros");
  const srv = servidorAtual();
  if (!srv || S.modo !== "servidor") return painel.replaceChildren();

  const grupos = { dono: [], admin: [], mod: [], online: [], offline: [] };
  for (const uid of srv.membros || []) {
    const cargo = cargoDe(uid, srv);
    if (cargo !== "membro") grupos[cargo].push(uid);
    else grupos[statusDe(uid) === "offline" ? "offline" : "online"].push(uid);
  }
  const titulos = { dono: "Dono", admin: "Admins", mod: "Moderadores", online: "Online", offline: "Offline" };
  const blocos = [];
  for (const [chave, uids] of Object.entries(grupos)) {
    if (!uids.length) continue;
    const h = document.createElement("h3");
    h.className = "membros__titulo";
    h.textContent = `${titulos[chave]} — ${uids.length}`;
    const ul = document.createElement("ul");
    uids.sort((a, b) => perfil(a).nome.localeCompare(perfil(b).nome)).forEach(uid => ul.append(criarItemMembro(uid, srv)));
    blocos.push(h, ul);
  }
  painel.replaceChildren(...blocos);
}

function criarItemMembro(uid, srv) {
  const p = perfil(uid);
  const status = statusDe(uid);
  const li = document.createElement("li");
  const bt = document.createElement("button");
  bt.type = "button";
  bt.className = "membro membro--" + status;
  const av = criarAvatar(p.nome, p.foto);
  const bolinha = document.createElement("span");
  bolinha.className = "membro__status";
  bolinha.title = { online: "Online", afk: "AFK", offline: "Offline" }[status];
  const wrap = document.createElement("span");
  wrap.className = "membro__avatar";
  wrap.append(av, bolinha);
  const nome = document.createElement("span");
  nome.className = "membro__nome";
  nome.textContent = p.nome + (uid === S.user.uid ? " (você)" : "");
  nome.style.color = CARGOS[cargoDe(uid, srv)].nivel ? CARGOS[cargoDe(uid, srv)].cor : "";
  bt.append(wrap, nome);
  const naCall = [...S.pessoas].find(([u]) => u === uid);
  if (naCall) {
    const voz = document.createElement("span");
    voz.className = "membro__voz";
    voz.textContent = "🔊";
    voz.title = "Em um canal de voz";
    bt.append(voz);
  }
  bt.addEventListener("click", () => abrirMenuMembro(bt, uid));
  li.append(bt);
  return li;
}

function abrirMenuMembro(ancora, uid) {
  const itens = [];
  const nome = perfil(uid).nome;
  if (uid !== S.user.uid) itens.push({ rotulo: "💬 Mensagem direta", acao: () => abrirDm(uid) });
  if (possoAgirSobre(uid) && pode("gerenciarCargos")) {
    for (const cargo of cargosQuePossoDar())
      if (cargo !== cargoDe(uid)) itens.push({ rotulo: `Tornar ${CARGOS[cargo].rotulo}`, acao: () => mudarCargo(uid, cargo) });
  }
  if (possoAgirSobre(uid) && pode("expulsar")) itens.push({ rotulo: `Expulsar ${nome}`, acao: () => expulsar(uid), perigo: true });
  if (possoAgirSobre(uid) && pode("banir")) itens.push({ rotulo: `Banir ${nome}`, acao: () => banir(uid), perigo: true });
  if (!itens.length) itens.push({ rotulo: perfil(uid).nome, acao: () => {} });
  menuFlutuante(ancora, itens);
}

/* ------------------------------------------------------------ moderação */

async function mudarCargo(uid, cargo) {
  const cargos = { ...(servidorAtual().cargos || {}) };
  if (cargo === "membro") delete cargos[uid]; else cargos[uid] = cargo;
  await updateDoc(srvDoc(S.atual), { cargos })
    .then(() => aviso(`${perfil(uid).nome} agora é ${CARGOS[cargo].rotulo}.`))
    .catch(() => aviso("Você não tem permissão pra mudar cargos."));
}

async function expulsar(uid) {
  if (!confirm(`Expulsar ${perfil(uid).nome}? Ele pode voltar se receber um convite.`)) return;
  await updateDoc(srvDoc(S.atual), { membros: arrayRemove(uid) })
    .then(() => aviso("Membro expulso."))
    .catch(() => aviso("Você não tem permissão pra expulsar."));
}

async function banir(uid) {
  if (!confirm(`Banir ${perfil(uid).nome}? Ele não vai conseguir voltar nem com convite.`)) return;
  await updateDoc(srvDoc(S.atual), { membros: arrayRemove(uid), banidos: arrayUnion(uid) })
    .then(() => aviso("Membro banido."))
    .catch(() => aviso("Você não tem permissão pra banir."));
}

async function desbanir(uid) {
  await updateDoc(srvDoc(S.atual), { banidos: arrayRemove(uid) })
    .then(() => { aviso("Banimento removido."); renderConfigServidor(); })
    .catch(() => aviso("Você não tem permissão pra isso."));
}

/* ------------------------------------------------------------ configurações do servidor */

export function abrirConfigServidor() {
  if (!servidorAtual()) return;
  renderConfigServidor();
  $("dlgConfigServidor").showModal();
}

function renderConfigServidor() {
  const srv = servidorAtual();
  const souDono = meuCargo() === "dono";
  const possoCargos = pode("gerenciarCargos");

  // Geral
  $("campoRenomearServidor").value = srv.nome;
  $("campoRenomearServidor").disabled = !souDono;
  $("btRenomearServidor").hidden = !souDono;
  $("btExcluirServidor").hidden = !souDono;
  $("btSairServidor").hidden = souDono;

  // Permissões: tabela cargo x permissão
  const tabela = $("tabelaPermissoes");
  const cargosEditaveis = ["admin", "mod", "membro"];
  const cab = `<tr><th scope="col">Permissão</th>${cargosEditaveis.map(c => `<th scope="col">${esc(CARGOS[c].rotulo)}</th>`).join("")}</tr>`;
  const linhas = Object.entries(PERMISSOES).map(([chave, rotulo]) => {
    const celulas = cargosEditaveis.map(cargo => {
      const marcado = permissoesDoCargo(cargo, srv)[chave] ? "checked" : "";
      const bloqueado = !possoCargos || CARGOS[cargo].nivel >= CARGOS[meuCargo()].nivel ? "disabled" : "";
      return `<td><input type="checkbox" class="permissao" data-cargo="${cargo}" data-permissao="${chave}" aria-label="${esc(rotulo)} para ${esc(CARGOS[cargo].rotulo)}" ${marcado} ${bloqueado}></td>`;
    }).join("");
    return `<tr><th scope="row">${esc(rotulo)}</th>${celulas}</tr>`;
  }).join("");
  tabela.innerHTML = `<thead>${cab}</thead><tbody>${linhas}</tbody>`;
  $("btSalvarPermissoes").hidden = !possoCargos;
  $("avisoPermissoes").textContent = possoCargos
    ? "O dono sempre pode tudo. Você só muda cargos abaixo do seu."
    : "Só quem pode “Dar cargos e mudar permissões” edita esta tabela.";

  // Banidos
  const banidos = srv.banidos || [];
  const lista = $("listaBanidos");
  lista.replaceChildren(...banidos.map(uid => {
    const li = document.createElement("li");
    li.className = "banido";
    const nome = document.createElement("span");
    nome.textContent = perfil(uid).nome;
    li.append(criarAvatar(perfil(uid).nome, perfil(uid).foto), nome);
    if (pode("banir")) {
      const bt = document.createElement("button");
      bt.type = "button"; bt.className = "botao botao--pequeno"; bt.textContent = "Desbanir";
      bt.addEventListener("click", () => desbanir(uid));
      li.append(bt);
    }
    return li;
  }));
  if (!banidos.length) lista.innerHTML = `<li class="banido banido--vazio">Ninguém banido.</li>`;
}

async function salvarPermissoes() {
  const permissoes = structuredClone(servidorAtual().permissoes || {});
  for (const caixa of $("tabelaPermissoes").querySelectorAll(".permissao:not(:disabled)")) {
    permissoes[caixa.dataset.cargo] ??= {};
    permissoes[caixa.dataset.cargo][caixa.dataset.permissao] = caixa.checked;
  }
  await updateDoc(srvDoc(S.atual), { permissoes })
    .then(() => aviso("Permissões salvas!"))
    .catch(() => aviso("Você não tem permissão pra isso."));
}

async function renomearServidor() {
  const nome = $("campoRenomearServidor").value.trim().slice(0, LIMITES.tamanhoNome);
  if (!nome) return;
  await updateDoc(srvDoc(S.atual), { nome }).then(() => aviso("Nome salvo!")).catch(() => aviso("Não deu pra renomear."));
}

export function iniciarMembros() {
  $("btMembros").addEventListener("click", () => {
    document.body.classList.toggle("sem-membros");
    $("btMembros").setAttribute("aria-pressed", String(!document.body.classList.contains("sem-membros")));
  });
  for (const aba of document.querySelectorAll(".config__aba")) {
    aba.addEventListener("click", () => {
      for (const a of document.querySelectorAll(".config__aba")) a.setAttribute("aria-selected", String(a === aba));
      for (const p of document.querySelectorAll(".config__painel")) p.hidden = p.id !== aba.getAttribute("aria-controls");
    });
  }
  $("btSalvarPermissoes").addEventListener("click", salvarPermissoes);
  $("btRenomearServidor").addEventListener("click", renomearServidor);
  $("btExcluirServidor").addEventListener("click", () => { $("dlgConfigServidor").close(); excluirServidor(); });
  $("btSairServidor").addEventListener("click", () => { $("dlgConfigServidor").close(); sairDoServidor(); });
}
