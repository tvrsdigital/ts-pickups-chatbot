# Chatbot de atendimento no Instagram

O fluxo de conversa e os workflows do robô da **TS PickUps**

[Karen, Noah, Paula, Rafael e Ramon] · [Fundamentos de Sistemas de Informação] · Novembro de 2026

---

## O fluxo completo de conversa

```mermaid
flowchart LR
  MENU["Menu inicial<br/>Como posso ajudar?"]
  MENU -->|Captador de guitarra| GUI{Qual modelo?}
  MENU -->|Captador de baixo| BAI{Qual modelo?}
  MENU -->|Falar com atendente| ATE[[Atendente humano]]

  GUI -->|Single| ST[ST]
  GUI -->|Humbucker| EST{Qual estilo?}
  EST -->|Música popular| VERSUS[VERSUS]
  EST -->|Pop Rock| OUTSIDE[OutSide]
  EST -->|Metal| DIAMOND[Diamond]

  BAI -->|Precision| PRE{Qual som?}
  BAI -->|Jazz Bass| JB{Quantas cordas?}
  BAI -->|Precision Jazz| PJ[PJ]
  PRE -->|Pesado e potente| PUC[PUC]
  PRE -->|Mais tradicional| PSAM[PSAM]
  JB -->|4 cordas| BSL4[BSL4]
  JB -->|5 cordas| BSL5[BSL5]

  ST --> SITE
  VERSUS --> SITE
  OUTSIDE --> SITE
  DIAMOND --> SITE
  PJ --> SITE
  PUC --> SITE
  PSAM --> SITE
  BSL4 --> SITE
  BSL5 --> SITE

  SITE["Link do site<br/>+ 3 opções"] -->|Falar com atendente<br/>ou Comprar| ATE
  SITE -->|Finalizar conversa| FIM[[Fim da conversa]]
```

---

## Guitarra: até 3 perguntas

```mermaid
flowchart LR
  MENU["Menu inicial"] -->|Captador de guitarra| G{Qual modelo?}
  G -->|Single| ST[ST]
  G -->|Humbucker| E{Qual estilo?}
  E -->|Música popular| VERSUS[VERSUS]
  E -->|Pop Rock| OUTSIDE[OutSide]
  E -->|Metal| DIAMOND[Diamond]
```

- **Single** leva direto ao ST
- **Humbucker** pergunta o estilo musical e leva a um entre três modelos

---

## Baixo: três modelos, duas perguntas extras

```mermaid
flowchart LR
  MENU["Menu inicial"] -->|Captador de baixo| B{Qual modelo?}
  B -->|Precision| P{Qual som?}
  B -->|Jazz Bass| J{Quantas cordas?}
  B -->|Precision Jazz| PJ[PJ]
  P -->|Pesado e potente| PUC[PUC]
  P -->|Mais tradicional| PSAM[PSAM]
  J -->|4 cordas| BSL4[BSL4]
  J -->|5 cordas| BSL5[BSL5]
```

- **Precision** pergunta o som e **Jazz Bass** pergunta as cordas
- **Precision Jazz** leva direto ao PJ

---

## Depois da recomendação

```mermaid
flowchart LR
  REC["Uma das 9<br/>recomendações"] --> SITE["Link do site<br/>+ 3 opções"]
  SITE -->|Falar com atendente| H[[Pausa de 24 h<br/>e aviso no Telegram]]
  SITE -->|Comprar| H
  SITE -->|Finalizar conversa| F[[Fim da conversa<br/>sessão encerrada]]
```

- Quem digita em vez de tocar no botão recebe um aviso em português e a mesma pergunta
- O cliente pode pedir um atendente em qualquer ponto

**28 caminhos**: **19** terminam no atendente e **9** no fim da conversa.

---

## Arquitetura: quem conversa com quem

```mermaid
flowchart LR
  C[Cliente no Instagram] -->|mensagem| M[Meta / Instagram]
  M -->|webhook assinado| T[ngrok]
  T --> N[n8n]
  N <-->|fluxo de conversa| B[Typebot]
  N <-->|sessões e métricas| D[(PostgreSQL)]
  N -->|avisos| G[Telegram]
  N -->|resposta com botões| M
  M -->|entrega| C
```

---

## Os 4 workflows do n8n

| Workflow | O que faz |
|---|---|
| **01-verificacao-webhook** | Responde à verificação que a Meta faz ao cadastrar o webhook |
| **02-mensagens** | Recebe cada mensagem, conversa com o Typebot e responde |
| **04-retencao** | Apaga os dados vencidos todo dia |
| **99-erros** | Avisa no Telegram quando um nó falha |

*A numeração pula o 03: o workflow de renovar token foi descartado, porque o token não expira.*

---

## 02-mensagens: da chegada à resposta

```mermaid
flowchart LR
  A["1. Receber e validar<br/>assinatura HMAC"] --> B["2. Evitar repetição<br/>e abrir sessão"]
  B --> C["3. Conversar<br/>Typebot"]
  C --> D["4. Responder<br/>texto e botões"]
  D --> E["5. Registrar e encaminhar<br/>métricas e atendente"]
  A -.->|assinatura inválida| X(("Descarta"))
  B -.->|mensagem repetida<br/>ou bot pausado| X
```

- O filtro **Mensagem nova?** descarta cópias da mesma mensagem, mesmo em paralelo
- Ao pedir atendente, o robô pausa por 24 horas e avisa no Telegram

---

## 99-erros e 04-retencao

```mermaid
flowchart TB
  subgraph R["04-retencao"]
    direction LR
    D["Todo dia<br/>às 3h"] --> F["Apaga os<br/>dados vencidos"]
  end
  subgraph E["99-erros"]
    direction LR
    A["Um nó falha<br/>em 01, 02 ou 04"] --> C["Aviso no Telegram<br/>workflow, nó e erro"]
  end
```

- **Retenção:** sessões 30 dias, controle de repetição 7 dias, métricas 12 meses
- **Exemplo de erro:** com o Typebot desligado, o aviso chega ao Telegram; ao religar, o robô volta sozinho

---
## Testes e resultados

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **28 de 28** | caminhos aprovados no Typebot e pelo n8n                                     |
| **49 ms**    | processamento interno médio (p95: 55 ms; modo simulado)                      |
| **1,3 s**    | resposta média com envio real (79 medidas, 6 contas)                         |
| **4 falhas** | achadas pelos testes e corrigidas, incluindo mensagens repetidas em paralelo |

Também testados: Typebot fora do ar, 20 pessoas ao mesmo tempo, figurinha, imagem e áudio.

---

# Obrigado

**Próximos passos:** hospedagem 24 horas e testes de carga

**Justificativa, ferramentas e análise completa:** no artigo

**Repositório:** github.com/tvrsdigital/ts-pickups-chatbot

Perguntas?
