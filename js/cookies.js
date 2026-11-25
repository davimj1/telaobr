/**
 * cookies.js — Aviso de cookies e consentimento (LGPD).
 *
 * - O Telão só usa armazenamento ESSENCIAL (login, preferências, esta própria escolha).
 *   Ele funciona igual com "Aceitar" ou "Recusar".
 * - Rastreadores (Google Analytics, pixels…) só carregam se a pessoa ACEITAR
 *   e se houver um ID em config.js > ANALYTICS_ID. Hoje está vazio: nenhum rastreador.
 * - A escolha pode ser mudada a qualquer momento pelo link "Preferências de cookies".
 *
 * Usado no app (index.html) e nas páginas legais (privacidade, termos, cookies, reembolso).
 */
import { ANALYTICS_ID } from "./config.js";

const CHAVE = "telao-cookies";
const VERSAO = 1;

function lerEscolha() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) || "null");
    return salvo?.versao === VERSAO ? salvo : null;
  } catch { return null; }
}

function salvarEscolha(aceitou) {
  try { localStorage.setItem(CHAVE, JSON.stringify({ versao: VERSAO, analise: aceitou, data: new Date().toISOString() })); } catch {}
}

/** Carrega os rastreadores — SÓ é chamado depois do "Aceitar". */
function carregarRastreadores() {
  if (!ANALYTICS_ID || document.querySelector("script[data-analise]")) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(ANALYTICS_ID);
  script.dataset.analise = "sim";
  document.head.append(script);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", ANALYTICS_ID, { anonymize_ip: true });
}

/** Mostra a caixa de escolha. Ela não bloqueia o site e pode ser usada só com o teclado. */
export function mostrarAvisoCookies({ focar = false } = {}) {
  document.querySelector(".aviso-cookies")?.remove();
  const focoAnterior = document.activeElement;
  const atual = lerEscolha();

  const aviso = document.createElement("section");
  aviso.className = "aviso-cookies";
  aviso.setAttribute("role", "region");
  aviso.setAttribute("aria-labelledby", "tituloCookies");
  aviso.innerHTML = `
    <h2 id="tituloCookies" class="aviso-cookies__titulo">Sua privacidade</h2>
    <p class="aviso-cookies__texto">
      O Zart Telão usa só o armazenamento essencial pra funcionar (manter você conectado e lembrar suas
      preferências). <strong>Não usamos rastreamento nem anúncios.</strong> Se um dia usarmos cookies de
      análise, eles só serão ativados se você aceitar.
      Saiba mais na <a href="cookies.html">Política de Cookies</a>.
    </p>
    ${atual ? `<p class="aviso-cookies__atual">Sua escolha atual: <strong>${atual.analise ? "aceitou" : "recusou"}</strong>.</p>` : ""}
    <div class="aviso-cookies__botoes">
      <button type="button" class="botao botao--primario botao--pequeno" data-aceitar>Aceitar</button>
      <button type="button" class="botao botao--pequeno" data-recusar>Recusar</button>
    </div>`;

  const fechar = aceitou => {
    salvarEscolha(aceitou);
    if (aceitou) carregarRastreadores();
    aviso.remove();
    if (focar && focoAnterior?.isConnected) focoAnterior.focus();
  };
  aviso.querySelector("[data-aceitar]").addEventListener("click", () => fechar(true));
  aviso.querySelector("[data-recusar]").addEventListener("click", () => fechar(false));
  aviso.addEventListener("keydown", e => { if (e.key === "Escape" && lerEscolha()) { aviso.remove(); focoAnterior?.focus?.(); } });
  document.body.append(aviso);
  if (focar) aviso.querySelector("[data-aceitar]").focus();
}

/** Liga tudo: mostra o aviso na primeira visita e os links "Preferências de cookies". */
export function iniciarCookies() {
  const escolha = lerEscolha();
  if (!escolha) mostrarAvisoCookies();
  else if (escolha.analise) carregarRastreadores();
  document.addEventListener("click", e => {
    if (e.target.closest("[data-preferencias-cookies]")) mostrarAvisoCookies({ focar: true });
  });
}

// páginas legais carregam este arquivo sozinho
if (document.body?.dataset.pagina === "legal") iniciarCookies();
