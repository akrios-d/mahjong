# Jogos de Mesa Online — Mahjong, Landlord, Dominó, Adedonha, Desenho & Quebra-Cabeça

Seis implementações originais, em HTML/CSS/JS puro no front-end (sem build,
sem frameworks) mais um servidor Node/WebSocket para o multiplayer, dos
jogos clássicos chineses/brasileiros/de festa que aparecem em
*Where Winds Meet* (ou combinam com o clima):

- **Mahjong** (estilo Sichuan, igual ao mini-game do Where Winds Meet) —
  multiplayer online, 4 jogadores, 108 peças, Missing Suit, Pong/Kong/Chi/Hu,
  **ou** sozinho contra IA sem precisar de servidor.
- **Landlord / Dou Dizhu (斗地主)** — multiplayer online (até 3 jogadores
  reais por sala) **ou** sozinho contra IA sem precisar de servidor.
- **Dominó em Duplas** — multiplayer online (até 4 jogadores reais por sala,
  em duplas fixas) **ou** sozinho contra IA sem precisar de servidor.
- **Adedonha** (Stop!) — até 8 jogadores propõem categorias, sorteiam a
  letra e escrevem palavras até alguém gritar "PARE!"; bots preenchem
  cadeiras vazias usando um banco de palavras para as categorias padrão.
- **Desenho & Adivinha** (estilo Gartic/Pictionary) — um jogador desenha,
  os outros adivinham pelo chat; só entre pessoas reais (desenhar e
  adivinhar não dá pra automatizar com bot aqui).
- **Quebra-Cabeça** — alguém sobe uma foto, escolhe o tamanho da grade e
  todo mundo na sala arrasta peças ao mesmo tempo pra montar; peças com
  bordas onduladas geradas por uma cadeia de Markov (só entre pessoas
  reais, como o Desenho).

O app também funciona como **PWA**: dá pra instalar no celular/desktop e o
app shell funciona offline (o multiplayer sempre precisa de rede, mas os
modos "sozinho contra IA" funcionam sem internet depois de instalado).

Este projeto **não usa nenhum asset, código ou texto do jogo**
*Where Winds Meet* — é uma recriação independente das regras de jogos
tradicionais chineses e brasileiros, que são de domínio público.

## Rodando localmente

Os modos **"sozinho contra IA"** do Mahjong/Landlord/Dominó não precisam de
servidor — é só abrir o `index.html` do jogo no navegador.

Mahjong, Landlord, Dominó, Adedonha, Desenho e Quebra-Cabeça (multiplayer
online) precisam do servidor WebSocket rodando (ele guarda o estado das
mesas e comanda a IA):

```bash
cd server
npm install
npm start        # sobe em ws://localhost:8787 (ou $PORT, se definido)
```

Depois abra o `index.html` do jogo — o endereço do servidor já vem
pré-preenchido como `ws://localhost:8787`. Cada pessoa que quiser jogar
entra com o mesmo código de sala; quem estiver na sala pode clicar em
**"Começar com IA"** (Mahjong/Landlord/Dominó/Adedonha) para preencher as
cadeiras vazias com bots, ou **"Começar só com quem entrou"**
(Adedonha/Desenho/Quebra-Cabeça) para travar a sala só com quem já está
presente.

> Se alguém desconectar no meio da partida, a IA assume o assento
> automaticamente (exceto no Desenho e no Quebra-Cabeça, que não têm
> bots — o assento só fica marcado como desconectado).

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

O front-end (`index.html` e as pastas de cada jogo) pode ficar em qualquer
hospedagem estática (GitHub Pages, Render Static Site, etc.) — ele só
precisa saber o endereço do WebSocket do servidor.

## Regras do Mahjong adotadas

Baseado nas regras reais do mini-game de Mahjong do *Where Winds Meet*
(estilo Sichuan / "Bloody Mahjong"):

- 108 peças: só os 3 naipes numéricos (Bambu, Bolinha, Caractere) de 1 a 9,
  4 cópias cada — **sem** ventos, dragões ou flores.
- 4 jogadores, 13 peças cada de início.
- **Missing Suit**: depois de ver sua mão, cada jogador escolhe em segredo
  um dos 3 naipes para abandonar. Sua mão final só pode usar os outros 2
  naipes — você não pode fechar (Hu) enquanto tiver alguma peça do naipe
  escolhido.
- Turno: compra 1 peça (fica com 14) → pode declarar Kong oculto ou Hu
  própria (zimo) → descarta (volta pra 13 soltas + grupos revelados).
- Quando alguém descarta, os outros jogadores podem reagir: **Hu** (fechar
  com essa peça) > **Kong** (4 iguais) > **Pong** (3 iguais) > **Chi**
  (sequência de 3, só quem está à direita de quem descartou). Prioridade
  nessa ordem; empates resolvidos por proximidade de quem descartou.
- Vitória: 4 grupos (trinca/sequência/quadra) + 1 par, usando no máximo 2
  dos 3 naipes.
- Sem pontuação por Fan/multiplicadores — a primeira mão fechada
  simplesmente vence a rodada. Se o monte acabar sem ninguém fechar, a
  rodada termina sem vencedor.

**Simplificações assumidas** (o doc original menciona variações e a IA
precisa de regras fixas para jogar):
- Chi está sempre habilitado.
- Sem "kong roubado" (ganhar a peça de um Kong adicional de outro jogador)
  nem "kong adicionado" (promover um Pong existente pra Kong puxando a 4ª
  peça comprada) — só Kong oculto (na sua vez, com 4 na mão) e Kong aberto
  reclamando um descarte (com 3 na mão).
- A IA nunca reclama Chi (só Hu/Kong/Pong), e não faz Pong toda vez que
  pode — o próprio jogo real avisa que Pong automático costuma ser um erro
  estratégico, então a IA só faz isso ~40% das vezes que é elegível.

## Regras do Dominó adotadas

- 28 peças (double-six), 4 jogadores recebem 6 peças cada (24), as 4
  peças restantes formam o **morto**: ficam de lado, escondidas, e nunca
  são compradas ou reveladas durante a partida.
- Duplas fixas: assentos 1+3 contra 2+4 (parceiros sentados de frente).
- Abre quem tiver a maior carroça (peça dobrada) na mão; se ninguém tiver
  nenhuma (pode acontecer porque 4 peças ficam escondidas no morto), abre
  quem tiver a peça de maior soma de pontos.
- Partida vai até **6 pontos**. Pontuação por tipo de batida:
  - **Batida normal** — bate com peça comum, sem nenhum encaixe especial: **1 ponto**
  - **Carroça** — bate com peça dobrada (e essa jogada não deixa as duas
    pontas iguais): **2 pontos**
  - **Lá-e-lô** — as duas pontas do tabuleiro têm números diferentes
    (ex.: uma ponta 3, a outra 5) e você bate com a peça que encaixa
    exatamente nas duas (a peça 3-5, nesse exemplo): **3 pontos**
  - **Cruzada** — as duas pontas já estão com o mesmo número e você bate
    com a carroça daquele número, fechando com as pontas continuando
    iguais: **4 pontos**
  - Quando o jogo tranca (ninguém consegue jogar), vence a dupla com menor
    soma de pontos na mão e marca 1 ponto (batida normal "por pontos" —
    nenhum dos bônus acima se aplica aqui, já que ninguém fechou com uma
    peça específica); em caso de empate de soma, a mão é redistribuída
    sem pontuar.

## Regras da Adedonha adotadas

- Até 8 jogadores; qualquer um propõe categorias (máx. 8) ou usa o botão
  de categorias padrão (País, Fruta, Animal, Cor, Nome, Objeto, Cidade,
  Profissão).
- Uma letra é sorteada por rodada (sem repetir até esgotar o alfabeto).
  Todo mundo escreve, e quem gritar "PARE!" encerra a rodada na hora
  (ou o tempo acaba sozinho em 60s).
- Pontuação por categoria: resposta válida (começa com a letra sorteada)
  e única entre os jogadores = **10 pontos**; válida mas repetida por mais
  de um jogador = **5 pontos** cada; inválida ou em branco = **0**.
- Os bots só respondem categorias que reconhecem (as padrão); categoria
  personalizada não reconhecida fica em branco para eles.

## Como o Quebra-Cabeça funciona

- Quem sobe a foto: ela é redimensionada no navegador (até 900px no lado
  maior, JPEG) antes de ir pro servidor, que guarda e retransmite pra todo
  mundo da sala — não fica salva em disco, some quando a sala acaba.
- Escolha a grade (2×2 até 8×8) e as peças são cortadas na hora. Cada
  borda interna vira uma linha ondulada: uma cadeia de Markov (passeio
  aleatório com viés de persistência, estado -2 a 2) decide o deslocamento
  em 4 pontos ao longo da borda — dá pra cada peça um contorno único e
  orgânico, mas as duas peças vizinhas sempre encaixam exatamente porque
  ambas leem os mesmos pontos da borda compartilhada. Isso é gerado uma
  vez no servidor (com semente aleatória) e mandado como uma assinatura
  pequena pra todo mundo — ninguém re-sorteia por conta própria, então
  todo cliente desenha peças idênticas.
- Todo mundo arrasta ao mesmo tempo; a posição de uma peça em arraste
  aparece em tempo real pra todo mundo. Ao soltar perto do lugar certo
  (dentro de uma margem), a peça encaixa e trava — ninguém mais move ela.
- Sem rotação de peça (só translação) e sem timer — o quebra-cabeça só
  termina quando todas as peças estiverem encaixadas.

## Limitações conhecidas

- Sem reconexão "retomando o mesmo assento": se você cair da sala durante
  uma partida, a IA assume seu lugar imediatamente (exceto no Desenho e
  no Quebra-Cabeça).
- Sem espectadores — a sala aceita só o número de assentos do jogo.
- Landlord não implementa avião (trincas consecutivas) nem sequências de
  pares — só single, par, trinca, trinca+1, trinca+par, sequência, bomba
  e rocket.
- Mahjong não tem pontuação por Fan/multiplicadores, nem kong
  roubado/adicionado (veja "Regras do Mahjong adotadas" acima).
- Adedonha não valida se a palavra realmente existe/pertence à categoria
  (fica no sistema de honra, como no jogo físico) — só confere se começa
  com a letra sorteada e se é única entre as respostas.
- Desenho & Adivinha não tem bots (nenhuma IA desenha ou adivinha aqui).
- Quebra-Cabeça também não tem bots, nem rotação de peça, nem imagem
  persistida (some quando a sala acaba/servidor reinicia).

## Estrutura

```
index.html                    landing page
style.css
manifest.json / sw.js / icons/   PWA (instalável, app shell offline)
shared/
  pwa.js                        registra o service worker
  roomUtils.js                  helpers de sala/assento comuns a todos os jogos
  mahjongRules.js / mahjongEngine.js        peças + orquestração do Mahjong (Sichuan)
  landlordRules.js / landlordEngine.js      regras + orquestração do Landlord
  dominoRules.js / dominoEngine.js          regras + orquestração do Dominó
  adedonhaWords.js / adedonhaEngine.js      banco de palavras + orquestração da Adedonha
  desenhoWords.js / desenhoEngine.js        banco de palavras + orquestração do Desenho
  puzzleShapes.js / puzzleEngine.js         cadeia de Markov (bordas) + orquestração do Quebra-Cabeça
server/
  server.js                     servidor WebSocket (salas, estado autoritativo, IA)
  package.json
mahjong/                        Mahjong estilo Where Winds Meet — online ou sozinho contra IA
landlord/                       Landlord — online ou sozinho contra IA
domino/                         Dominó em duplas — online ou sozinho contra IA
adedonha/                       Adedonha — online (com bots)
desenho/                        Desenho & Adivinha — online (sem bots)
puzzle/                         Quebra-Cabeça colaborativo — online (sem bots)
```
