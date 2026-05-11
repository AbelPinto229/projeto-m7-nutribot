# NutriBot - Diário Alimentar com IA

Assistente inteligente que extrai macronutrientes e calorias a partir de descrições de refeições em linguagem natural, mantendo um diário alimentar persistente.

## O que foi implementado

### 1. Chat com Streaming e Contexto
- Endpoint `GET /chat?message=...` que devolve `text/event-stream`
- Histórico das últimas 5 mensagens em memória para contexto
- Interface de chat estilo moderno com respostas em tempo real

### 2. NutriBot Parser (NLP para JSON)
- Endpoint `POST /nutrition/parse` converte texto livre em macros estruturados
- Validação com `zod` e `zod-to-json-schema`
- JSON com os campos:
  - `alimento`
  - `kcal` (número inteiro)
  - `proteina` (ex: "12g")
  - `carboidratos` (ex: "30g")
  - `gordura` (ex: "5g")

### 3. Diário Alimentar com Persistência SQLite
- Tabela `food_diary` com todas as entradas
- Endpoint `GET /nutrition/diary` devolve todo o histórico
- Endpoint `DELETE /nutrition/diary/:id` apaga uma entrada (Tool Use)

### Funcionalidades Bónus

#### 🎙️ Speech-to-Text
- Web Speech API integrada no frontend
- Botão de microfone para submeter prompts por voz
- Reconhecimento em português (pt-PT)

#### 🎨 Temas Dinâmicos
- O bot muda as cores da interface com base no humor da conversa
- Tema `stressed` (vermelho) quando palavras negativas são detetadas
- Tema `happy` (azul/ciano) quando palavras positivas são detetadas
- Transições suaves entre temas com CSS

#### 🛠️ Tool Use / Function Calling
- Botão "✕" em cada entrada do diário chama `DELETE /nutrition/diary/:id`
- Executa função real de apagar da base de dados SQLite

## Banco de dados
- SQLite em `src/nutribot.db`
- Tabela: `food_diary`

## Dependências
- `express`
- `sqlite3`
- `zod`
- `zod-to-json-schema`
- `dotenv`
- `@google/genai`

## Estrutura do Projeto
```
nutribot/
├── src/
│   ├── api.js          # Servidor Express principal
│   ├── db.js           # SQLite (food_diary)
│   ├── groqClient.js   # Cliente Groq com streaming
│   └── nutriParser.js  # Parser de macros com Zod
├── public/
│   └── index.html      # Frontend (chat + diário)
├── package.json
├── .gitignore
└── README.md
```

## Endpoints
- `GET /chat?message=...` — chat em streaming SSE com contexto
- `POST /nutrition/parse` — extrai macros de texto livre e guarda no diário
- `GET /nutrition/diary` — devolve todo o diário alimentar
- `DELETE /nutrition/diary/:id` — apaga uma entrada do diário

## Como correr
```bash
# Instalar dependências
npm install

# Criar ficheiro .env com a chave Gemini
echo "GEMINI_API_KEY=a_tua_chave" > .env

# Iniciar servidor
npm start
```

Aceder em: http://localhost:3000