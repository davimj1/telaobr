/**
 * main.js — Ponto de entrada do Telão. Só liga as partes, na ordem certa.
 *
 *   config.js       configurações (Firebase, cargos, permissões, modelos, emojis)
 *   firebase.js     conexão com o Firebase
 *   estado.js       estado global do app
 *   util.js         funções pequenas reutilizáveis
 *   compat.js       celular, iPhone, navegadores antigos
 *   ui.js           redesenhar a tela e abas do celular
 *   auth.js         login com Google
 *   perfis.js       nome/foto/status das pessoas e AFK
 *   permissoes.js   cargos e o que cada um pode fazer
 *   servidores.js   criar, abrir, convidar
 *   canais.js       canais de texto e voz
 *   chat.js         mensagens, reações, responder, fixar, anexos
 *   emoji.js        seletor de emoji
 *   membros.js      lista de membros, moderação e configurações do servidor
 *   dm.js           mensagens diretas
 *   call.js         entrar/sair de canais de voz e presença
 *   rtc.js          conexões de voz e vídeo (WebRTC)
 *   midia.js        microfone, apertar-pra-falar, câmera, tela, ensurdecer
 *   palco.js        telas ao vivo e pessoas do canal de voz
 *   fala.js         indicador de quem está falando
 *   avisos.js       não lidas, menções, sons, notificações e título da aba
 *   ponte.js        configurar a ponte de conexão (TURN) pelo site
 *   app.js          instalar como app (PWA) e notificações pelo service worker
 *   amigos.js       código de amigo, pedidos de amizade e tela de amigos
 */
import { iniciarCompat } from "./compat.js";
import { iniciarAbas, renderTudo } from "./ui.js";
import { iniciarLogin } from "./auth.js";
import { iniciarMeuStatus, carregarMeuPerfil } from "./perfis.js";
import { iniciarServidores, ouvirServidores, tratarConvite } from "./servidores.js";
import { iniciarCanais } from "./canais.js";
import { iniciarChat } from "./chat.js";
import { iniciarMembros } from "./membros.js";
import { iniciarDms, ouvirDms } from "./dm.js";
import { iniciarCall } from "./call.js";
import { iniciarMidia } from "./midia.js";
import { iniciarAvisos } from "./avisos.js";
import { iniciarMiniLive } from "./palco.js";
import { iniciarPonte } from "./ponte.js";
import { iniciarApp } from "./app.js";
import { iniciarAmigos, aoEntrarAmigos } from "./amigos.js";

iniciarCompat();
iniciarApp();
iniciarAbas();
iniciarServidores();
iniciarCanais();
iniciarChat();
iniciarMembros();
iniciarDms();
iniciarCall();
iniciarMidia();
iniciarAvisos();
iniciarMiniLive();
iniciarPonte();
iniciarAmigos();

iniciarLogin({
  async aoEntrar() {
    await carregarMeuPerfil(); // apelido e foto escolhidos no Telão
    iniciarMeuStatus();
    ouvirServidores();
    ouvirDms();
    aoEntrarAmigos();
    await tratarConvite();
    renderTudo();
  },
});
