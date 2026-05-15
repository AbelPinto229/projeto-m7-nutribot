# NutriBot — Diário Alimentar com IA

Assistente de nutrição inteligente que analisa refeições descritas em linguagem natural, calcula macronutrientes e mantém um diário alimentar persistente com base de dados MySQL.

## O que faz

O utilizador descreve o que comeu em texto livre ("comi 2 ovos e uma fatia de pão") e o NutriBot:

1. Extrai automaticamente os macronutrientes (calorias, proteína, hidratos, gordura) usando IA
2. Guarda a refeição no diário alimentar (MySQL)
3. Analisa a refeição com base no perfil e objetivos do utilizador
4. Dá feedback honesto sobre se a refeição está alinhada com as metas nutricionais

---

## Funcionalidades

### Chat com IA
- Conversa em linguagem natural com o NutriBot
- Contexto das últimas 5 mensagens para respostas mais relevantes
- Feedback personalizado com base no perfil do utilizador (peso, altura, objetivo, etc.)
- Cálculo automático de TMB, TDEE e macros diárias (fórmula de Mifflin-St Jeor)

### Diário Alimentar
- Registo automático de refeições a partir do chat
- Totalizador de calorias do dia
- Eliminar refeições individualmente (botão ✕) ou por comando ao chat
- Substituir refeições por comando ("troca o frango por atum")

### Tool Use / Function Calling
A IA pode chamar funções no servidor para gerir o diário:
- `delete_food_entry` — elimina uma refeição pelo nome
- `delete_last_food_entry` — elimina a última refeição
- `delete_all_food_entries` — limpa o diário inteiro
- `replace_food_entry` — substitui uma refeição por outra

### Temas Dinâmicos
A interface muda de cor com base na qualidade da refeição:
- **happy** — refeição dentro das metas
- **ok** — aceitável, com pequenas falhas
- **stressed** — proteína ou calorias insuficientes
- **angry** — refeição que contradiz o objetivo

### Speech-to-Text
- Botão de microfone para ditar mensagens por voz
- Reconhecimento em português (pt-PT) via Web Speech API

### Perfil do Utilizador
- Modal inicial para recolher dados (nome, idade, peso, altura, objetivo)
- Auto-login via localStorage
- Perfil usado para personalizar todas as respostas da IA

---

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + Express |
| IA | Groq API (modelo `llama-3.3-70b-versatile`) |
| Base de dados | MySQL + mysql2 |
| Frontend | HTML + CSS + JavaScript vanilla |

---

## Estrutura do Projeto

```
nutribot/
├── src/
│   ├── api.js           # Servidor Express — rotas HTTP
│   ├── chatService.js   # Lógica do chat — orquestra IA e tools
│   ├── groqClient.js    # Cliente Groq — chamadas à API de IA
│   ├── foodTools.js     # Execução das tool calls (BD)
│   ├── nutriParser.js   # Extração de macros em JSON
│   ├── systemPrompt.js  # Prompt do sistema com cálculos nutricionais
│   ├── db.js            # Ligação MySQL e queries
│   └── errors.js        # Mensagens de erro amigáveis
├── Public/
│   ├── index.html       # Estrutura da página
│   ├── nutribot.css     # Estilos e temas
│   └── js/
│       ├── utils.js     # Constantes e funções partilhadas
│       ├── chat.js      # Lógica do chat (enviar/receber mensagens)
│       ├── diary.js     # Diário alimentar (DOM)
│       ├── mood.js      # Temas dinâmicos
│       ├── nutrition.js # Deteção e parsing de refeições
│       ├── speech.js    # Reconhecimento de voz
│       └── user.js      # Perfil e auto-login
├── endpoints.md         # Documentação dos endpoints
├── fluxo.md             # Fluxo completo de uma mensagem
├── .env                 # Variáveis de ambiente (não partilhar)
└── package.json
```

---

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| POST | `/users` | Criar utilizador |
| GET | `/users/:id` | Obter utilizador |
| GET | `/chat?message=...&user_id=...` | Enviar mensagem ao chat |
| GET | `/chat/history?user_id=...` | Histórico de mensagens |
| POST | `/nutrition/parse` | Extrair macros de texto |
| GET | `/nutrition/diary?user_id=...` | Ver diário do dia |
| DELETE | `/nutrition/diary/:id` | Apagar refeição |

---

## Como correr

### Pré-requisitos
- Node.js
- MySQL com uma base de dados chamada `nutribot`
- Chave de API do Groq

### Instalação

```bash
# Instalar dependências
npm install

# Criar ficheiro .env
cp .env.example .env
# Preencher GROQ_API_KEY, DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
```

### Configuração do `.env`

```
GROQ_API_KEY=a_tua_chave_groq

DB_HOST=localhost
DB_USER=root
DB_PASSWORD=a_tua_password
DB_NAME=nutribot
```

### Criar a base de dados no MySQL

```sql
CREATE DATABASE IF NOT EXISTS nutribot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

As tabelas são criadas automaticamente quando o servidor arranca.

### Iniciar

```bash
npm start
```

Aceder em: http://localhost:3000
