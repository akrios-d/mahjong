# Mahjong Solitaire, Landlord & Dominó em Duplas

Três implementações originais, em HTML/CSS/JS puro no front-end (sem build,
sem frameworks) mais um servidor Node/WebSocket para o multiplayer, dos
mini-jogos clássicos chineses/brasileiros que aparecem em *Where Winds Meet*:

- **Mahjong Solitaire** (Turtle) — single-player: combine pares de peças
  livres até limpar o tabuleiro.
- **Landlord / Dou Dizhu (斗地主)** — multiplayer online (até 3 jogadores
  reais por sala) + IA preenchendo as cadeiras vazias.
- **Dominó em Duplas** — multiplayer online (até 4 jogadores reais por sala,
  em duplas fixas) + IA preenchendo as cadeiras vazias.

Este projeto **não usa nenhum asset, código ou texto do jogo**
*Where Winds Meet* — é uma recriação independente das regras de jogos
tradicionais chineses e brasileiros, que são de domínio público.

## Rodando localmente

O Mahjong Solitaire não precisa de servidor: só abrir `mahjong/index.html`
no navegador.

Landlord e Dominó precisam do servidor WebSocket rodando (ele guarda o
estado das mesas e comanda a IA):

```bash
cd server
npm install
npm start        # sobe em ws://localhost:8787 (ou $PORT, se definido)
```

Depois abra `index.html` (ou `landlord/index.html` / `domino/index.html`)
no navegador — o endereço do servidor já vem pré-preenchido como
`ws://localhost:8787`. Cada pessoa que quiser jogar entra com o mesmo
código de sala; quem estiver na sala pode clicar em **"Começar com IA"**
para preencher as cadeiras vazias com bots e iniciar a partida.

> Se alguém desconectar no meio da partida, a IA assume o assento
> automaticamente para o jogo continuar.

## Publicando o servidor (ex.: Render)

O servidor é um app Node comum (`server/server.js`, escuta em
`process.env.PORT`), então funciona em qualquer host que rode Node com
WebSocket — Render inclusive:

1. Crie um **Web Service** no Render apontando para este repositório.
2. **Root Directory**: `server`
3. **Build Command**: `npm install`
4. **Start Command**: `npm start`
5. O Render injeta `PORT` automaticamente — o servidor já lê `process.env.PORT`.
6. Depois do deploy, use a URL que o Render te dá, trocando `https://` por
   `wss://`, no campo "Endereço do servidor" da tela de login do jogo
   (ex.: `wss://seu-app.onrender.com`).

O front-end (`index.html`, `mahjong/`, `landlord/`, `domino/`) pode ficar
em qualquer hospedagem estática (GitHub Pages, Render Static Site, etc.) —
ele só precisa saber o endereço do WebSocket do servidor.

## Regras do Dominó adotadas

- 28 peças (double-six), 4 jogadores recebem 6 peças cada (24), as 4
  peças restantes formam o **morto**: ficam de lado, escondidas, e nunca
  são compradas ou reveladas durante a partida.
- Duplas fixas: assentos 1+3 contra 2+4 (parceiros sentados de frente).
- Abre quem tiver a maior carroça (peça dobrada) na mão; se ninguém tiver
  nenhuma (pode acontecer porque 4 peças ficam escondidas no morto), abre
  quem tiver a peça de maior soma de pontos.
- Partida vai até **6 pontos**. Pontuação por tipo de batida:
  - **Batida normal** — bate com peça comum: **1 ponto**
  - **Carroça** — bate com peça dobrada: **2 pontos**
  - **Lá-e-lô** — jogo tranca (ninguém consegue jogar) e as duas pontas
    do tabuleiro ficam com o mesmo número: **3 pontos**
  - **Cruzada** — bate com peça dobrada e essa jogada deixa as duas pontas
    do tabuleiro com o mesmo número: **4 pontos**
  - Quando o jogo tranca sem as pontas iguais, vence a dupla com menor
    soma de pontos na mão (marca 1 ponto, "batida normal por pontos"); em
    caso de empate de soma, a mão é redistribuída sem pontuar.

Essas definições foram a interpretação padrão adotada para a implementação;
se no seu grupo alguma dessas 4 batidas funciona diferente, é só pedir o
ajuste.

## Limitações conhecidas

- Sem reconexão "retomando o mesmo assento": se você cair da sala durante
  uma partida, a IA assume seu lugar imediatamente.
- Sem espectadores — a sala aceita só o número de assentos do jogo.
- Landlord não implementa avião (trincas consecutivas) nem sequências de
  pares — só single, par, trinca, trinca+1, trinca+par, sequência, bomba
  e rocket.

## Estrutura

```
index.html                    landing page
style.css
shared/
  landlordRules.js             baralho, combinações, IA — usado pelo servidor e pelo client
  dominoRules.js                baralho, tabuleiro, pontuação — usado pelo servidor e pelo client
server/
  server.js                     servidor WebSocket (salas, estado autoritativo, IA)
  package.json
mahjong/                        Mahjong Solitaire (single-player)
  index.html / mahjong.css / mahjong.js
landlord/                       Landlord online
  index.html / landlord.css / landlord-client.js
domino/                         Dominó em duplas online
  index.html / domino.css / domino-client.js
```
