/**
 * sw.js — "Service worker" do Telão: o que faz o site virar um app instalável.
 *
 *  - Guarda os arquivos do site no aparelho, pra abrir rápido (e mostrar a tela
 *    mesmo com a internet caindo).
 *  - Sempre tenta baixar a versão nova primeiro: quando você sobe uma atualização
 *    no GitHub, todo mundo recebe na próxima vez que abrir o app.
 *  - Mostra as notificações e, ao clicar nelas, abre o app no lugar certo.
 *
 * Ao adicionar um arquivo novo no site, ponha ele em ARQUIVOS e aumente a VERSAO.
 */
const VERSAO = "telao-v2.2";

const ARQUIVOS = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/style.css",
  "img/logo.svg",
  "img/logo.png",
  "img/google.svg",
  "img/icones/icone-192.png",
  ...[
    "main", "config", "firebase", "estado", "util", "compat", "ui", "auth", "perfis",
    "permissoes", "servidores", "canais", "chat", "emoji", "membros", "dm", "call",
    "rtc", "midia", "palco", "fala", "avisos", "ponte", "app",
  ].map(nome => `js/${nome}.js`),
];

// Biblioteca do Firebase: o endereço tem a versão, então nunca muda — pode guardar de vez
const SDK_FIREBASE = /^https:\/\/www\.gstatic\.com\/firebasejs\//;

self.addEventListener("install", evento => {
  evento.waitUntil(
    caches.open(VERSAO)
      .then(cache => cache.addAll(ARQUIVOS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", evento => {
  evento.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== VERSAO).map(n => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", evento => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;
  const url = new URL(pedido.url);

  if (SDK_FIREBASE.test(pedido.url)) {
    evento.respondWith(primeiroDoCache(pedido));
  } else if (url.origin === location.origin) {
    evento.respondWith(primeiroDaRede(pedido));
  }
  // o resto (banco do Firebase, login do Google, Metered…) passa direto, sem mexer
});

/** Arquivos do site: tenta a internet (versão mais nova); se falhar, usa o guardado. */
async function primeiroDaRede(pedido) {
  const cache = await caches.open(VERSAO);
  try {
    const resposta = await fetch(pedido);
    if (resposta.ok) cache.put(pedido, resposta.clone());
    return resposta;
  } catch {
    const guardado = await cache.match(pedido, { ignoreSearch: pedido.mode === "navigate" });
    return guardado || (pedido.mode === "navigate" ? cache.match("index.html") : Response.error());
  }
}

/** Biblioteca do Firebase: usa a guardada; só baixa se ainda não tiver. */
async function primeiroDoCache(pedido) {
  const cache = await caches.open(VERSAO);
  const guardado = await cache.match(pedido);
  if (guardado) return guardado;
  const resposta = await fetch(pedido);
  if (resposta.ok) cache.put(pedido, resposta.clone());
  return resposta;
}

/* ------------------------------------------------------------ notificações */

self.addEventListener("notificationclick", evento => {
  evento.notification.close();
  const id = evento.notification.data?.id;
  evento.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const janela = janelas[0];
    if (janela) {
      await janela.focus();
      janela.postMessage({ tipo: "notificacao-clicada", id });
    } else {
      await self.clients.openWindow("./");
    }
  })());
});
