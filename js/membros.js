/**
 * membros.js — Lista de membros (por cargo e status), ações de moderação
 * e a janela de configurações do servidor (geral, permissões, banidos).
 */
import { updateDoc, arrayRemove, arrayUnion, srvDoc } from "./firebase.js";
import { S, servidorAtual } from "./estado.js";
import { CARGOS, PERMISSOES, LIMITES } from "./config.js";
import { $, criarAvatar, aviso, confirmar, menuFlutuante, esc, comprimirImagem, imagemSegura, enquadrarCapa, lerArquivo } from "./util.js";
import { deleteField } from "./firebase.js";
import { cargoDe, meuCargo, pode, possoAgirSobre, cargosQuePossoDar, permissoesDoCargo } from "./permissoes.js";
import { perfil, statusDe } from "./perfis.js";
import { abrirDm } from "./dm.js";
import { situacao, pedirAmizade, aceitar } from "./amigos.js";
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
  if (uid !== S.user.uid) {
    const s = situacao(uid);
    if (s === "amigo") itens.push({ rotulo: "💬 Mensagem direta", acao: () => abrirDm(uid) });
    else if (s === "recebido") itens.push({ rotulo: "✓ Aceitar amizade", acao: () => aceitar(uid) });
    else if (s === "enviado") itens.push({ rotulo: "⏳ Pedido de amizade enviado", acao: () => {} });
    else itens.push({ rotulo: "➕ Adicionar amigo", acao: () => pedirAmizade(uid) });
  }
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
  if (!await confirmar(`${perfil(uid).nome} pode voltar se receber um convite.`, { titulo: `Expulsar ${perfil(uid).nome}?`, botao: "Expulsar" })) return;
  await updateDoc(srvDoc(S.atual), { membros: arrayRemove(uid) })
    .then(() => aviso("Membro expulso."))
    .catch(() => aviso("Você não tem permissão pra expulsar."));
}

async function banir(uid) {
  if (!await confirmar(`${perfil(uid).nome} não vai conseguir voltar nem com convite (dá pra desbanir depois).`, { titulo: `Banir ${perfil(uid).nome}?`, botao: "Banir" })) return;
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
  renderPreviewCapa(srv.capa, srv.capaAjuste, souDono);
  $("botoesCapa").hidden = !souDono;
  $("dicaCapa").hidden = !souDono;

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

/* ------------------------------------------------------------ foto de capa */

const CAPA_LADO = 1600;             // lado maior da foto (fica nítida mesmo com zoom)
const CAPA_MAX_CARACTERES = 850_000; // cabe no documento do servidor (limite do Firestore: 1 MB)
const AJUSTE_PADRAO = { x: 50, y: 50, z: 1 };

let ajuste = { ...AJUSTE_PADRAO };  // enquadramento sendo editado
let ajusteSalvo = { ...AJUSTE_PADRAO };

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
const arredondar = a => ({ x: Math.round(a.x * 10) / 10, y: Math.round(a.y * 10) / 10, z: Math.round(a.z * 100) / 100 });

function mostrarAjuste() {
  enquadrarCapa($("previewCapa"), ajuste);
  enquadrarCapa($("previewBolinha"), ajuste);
  $("zoomCapa").value = ajuste.z;
  const mudou = JSON.stringify(arredondar(ajuste)) !== JSON.stringify(arredondar(ajusteSalvo));
  $("btSalvarAjusteCapa").hidden = !mudou;
}

let podeEditarCapa = true;
function renderPreviewCapa(capa, ajusteAtual, editavel = podeEditarCapa) {
  podeEditarCapa = editavel;
  const img = $("previewCapa");
  const src = imagemSegura(capa);
  img.hidden = !src;
  $("semCapa").hidden = !!src;
  $("ladoCapa").hidden = !src;
  $("ajusteCapa").hidden = !src || !editavel;
  $("molduraCapa").classList.toggle("capa-config--editavel", !!src && editavel);
  $("molduraCapa").tabIndex = src && editavel ? 0 : -1;
  $("btRemoverCapa").hidden = !src;
  if (src) { img.src = src; $("previewBolinha").src = src; }
  ajusteSalvo = { ...AJUSTE_PADRAO, ...(ajusteAtual || {}) };
  ajuste = { ...ajusteSalvo };
  mostrarAjuste();
}

/**
 * Move a foto como se fosse arrastada dx/dy pixels.
 * Com object-fit: cover, o ponto x% da foto fica no ponto x% da moldura;
 * então a borda esquerda está em x·(largura da moldura − largura da foto).
 */
function moverCapa(dx, dy) {
  const img = $("previewCapa");
  const m = $("molduraCapa").getBoundingClientRect();
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (!iw || !ih) return;
  const escala = Math.max(m.width / iw, m.height / ih) * ajuste.z;
  const sobraX = iw * escala - m.width, sobraY = ih * escala - m.height;
  if (sobraX > 0.5) ajuste.x = limitar(ajuste.x - dx / sobraX * 100, 0, 100);
  if (sobraY > 0.5) ajuste.y = limitar(ajuste.y - dy / sobraY * 100, 0, 100);
  mostrarAjuste();
}

function zoomCapa(z) {
  ajuste.z = limitar(z, 1, 3);
  mostrarAjuste();
}

function ligarEditorCapa() {
  const moldura = $("molduraCapa");
  let ultimo = null;
  moldura.addEventListener("pointerdown", e => {
    if ($("previewCapa").hidden || !podeEditarCapa) return;
    ultimo = { x: e.clientX, y: e.clientY };
    moldura.setPointerCapture(e.pointerId);
    moldura.classList.add("capa-config--arrastando");
    e.preventDefault();
  });
  moldura.addEventListener("pointermove", e => {
    if (!ultimo) return;
    moverCapa(e.clientX - ultimo.x, e.clientY - ultimo.y);
    ultimo = { x: e.clientX, y: e.clientY };
  });
  const soltar = () => { ultimo = null; moldura.classList.remove("capa-config--arrastando"); };
  moldura.addEventListener("pointerup", soltar);
  moldura.addEventListener("pointercancel", soltar);
  moldura.addEventListener("wheel", e => {
    if ($("previewCapa").hidden || !podeEditarCapa) return;
    e.preventDefault();
    zoomCapa(ajuste.z - Math.sign(e.deltaY) * 0.1);
  }, { passive: false });
  moldura.addEventListener("keydown", e => {
    if ($("previewCapa").hidden || !podeEditarCapa) return;
    const passo = e.shiftKey ? 40 : 10;
    const mov = { ArrowLeft: [passo, 0], ArrowRight: [-passo, 0], ArrowUp: [0, passo], ArrowDown: [0, -passo] }[e.key];
    if (mov) { e.preventDefault(); moverCapa(...mov); }
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomCapa(ajuste.z + 0.1); }
    else if (e.key === "-") { e.preventDefault(); zoomCapa(ajuste.z - 0.1); }
  });
  $("zoomCapa").addEventListener("input", e => zoomCapa(+e.target.value));
  $("btCentralizarCapa").addEventListener("click", () => { ajuste = { ...AJUSTE_PADRAO }; mostrarAjuste(); });
  $("btSalvarAjusteCapa").addEventListener("click", salvarAjuste);
  // a foto nova só aparece depois de carregar: aí dá pra calcular o arraste
  $("previewCapa").addEventListener("load", mostrarAjuste);
}

async function salvarAjuste() {
  const novo = arredondar(ajuste);
  await updateDoc(srvDoc(S.atual), { capaAjuste: novo })
    .then(() => { ajusteSalvo = { ...novo }; ajuste = { ...novo }; mostrarAjuste(); aviso("Enquadramento salvo!"); })
    .catch(() => aviso("Não deu pra salvar o enquadramento."));
}

/** Foto inteira (sem cortar): o corte é feito pelo enquadramento. Tenta tamanhos menores se ficar pesada. */
async function prepararCapa(arquivo) {
  if (arquivo.type === "image/gif") {
    const gif = await lerArquivo(arquivo);
    if (gif.length <= CAPA_MAX_CARACTERES) return gif; // GIF continua animado
  }
  for (const [lado, qualidade] of [[CAPA_LADO, 0.85], [1280, 0.8], [1024, 0.75], [800, 0.7]]) {
    const foto = await comprimirImagem(arquivo, lado, qualidade, { forcarRedimensionar: true });
    if (foto.length <= CAPA_MAX_CARACTERES) return foto;
  }
  return null;
}

async function escolherCapa(arquivo) {
  if (!arquivo) return;
  if (!arquivo.type.startsWith("image/")) return aviso("Escolha uma imagem.");
  try {
    aviso("Preparando a capa…");
    const capa = await prepararCapa(arquivo);
    if (!capa) return aviso("Imagem muito pesada pra capa. Se for GIF, tente um mais curto.");
    await updateDoc(srvDoc(S.atual), { capa, capaAjuste: { ...AJUSTE_PADRAO } });
    renderPreviewCapa(capa, AJUSTE_PADRAO);
    $("molduraCapa").focus();
    aviso("Capa salva! Arraste a foto pra ajustar o enquadramento.");
  } catch {
    aviso("Não deu pra salvar a capa.");
  }
}

async function removerCapa() {
  await updateDoc(srvDoc(S.atual), { capa: deleteField(), capaAjuste: deleteField() })
    .then(() => { renderPreviewCapa(null); aviso("Capa removida."); })
    .catch(() => aviso("Não deu pra remover."));
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
  $("btEscolherCapa").addEventListener("click", () => $("entradaCapa").click());
  $("entradaCapa").addEventListener("change", e => { escolherCapa(e.target.files[0]); e.target.value = ""; });
  $("btRemoverCapa").addEventListener("click", removerCapa);
  ligarEditorCapa();
  $("btExcluirServidor").addEventListener("click", () => { $("dlgConfigServidor").close(); excluirServidor(); });
  $("btSairServidor").addEventListener("click", () => { $("dlgConfigServidor").close(); sairDoServidor(); });
}
