# Jogos de Mesa Online — Mahjong, Landlord, Dominó, Adedonha & Desenho

Seis implementações originais, em HTML/CSS/JS puro no front-end (sem build,
sem frameworks) mais um servidor Node/WebSocket para o multiplayer, dos
jogos clássicos chineses/brasileiros/de festa que aparecem em
*Where Winds Meet* (ou combinam com o clima):

- **Mahjong** (estilo Sichuan, igual ao mini-game do Where Winds Meet) —
  multiplayer online, 4 jogadores, 108 peças, Missing Suit, Pong/Kong/Chi/Hu,
  **ou** sozinho contra IA sem precisar de servidor.
- **Mahjong Solitaire** (Turtle) — single-player: combine pares de peças
  livres até limpar o tabuleiro. (Um jogo bem diferente do Mahjong acima —
  ficou como bônus da primeira versão do projeto.)
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

O app também funciona como **PWA**: dá pra instalar no celular/desktop e o
app shell funciona offline (o multiplayer sempre precisa de rede, mas o
Mahjong Solitaire e os modos "sozinho contra IA" funcionam sem internet
depois de instalado).

Este projeto **não usa nenhum asset, código ou texto do jogo**
*Where Winds Meet* — é uma recriação independente das regras de jogos
tradicionais chineses e brasileiros, que são de domínio público.

## Rodando localmente

O Mahjong Solitaire e os modos **"sozinho contra IA"** do Mahjong/Landlord/
Dominó não precisam de servidor — é só abrir o `index.html` do jogo no
navegador.

Mahjong, Landlord, Dominó, Adedonha e Desenho (multiplayer online) precisam
do servidor WebSocket rodando (ele guarda o estado das mesas e comanda a IA):

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
(Adedonha/Desenho) para travar a sala só com quem já está presente.

> Se alguém desconectar no meio da partida, a IA assume o assento
> automaticamente (exceto no Desenho, que não tem bots — o assento só
> fica marcado como desconectado).

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

## Limitações conhecidas

- Sem reconexão "retomando o mesmo assento": se você cair da sala durante
  uma partida, a IA assume seu lugar imediatamente (exceto no Desenho).
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
server/
  server.js                     servidor WebSocket (salas, estado autoritativo, IA)
  package.json
mahjong/                        Mahjong estilo Where Winds Meet — online ou sozinho contra IA
mahjong-solitaire/               Mahjong Solitaire (single-player, bônus)
landlord/                       Landlord — online ou sozinho contra IA
domino/                         Dominó em duplas — online ou sozinho contra IA
adedonha/                       Adedonha — online (com bots)
desenho/                        Desenho & Adivinha — online (sem bots)
```
