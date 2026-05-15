# NutriBot API Endpoints

Base URL: `http://localhost:3000`

---

## Utilizadores

### Criar utilizador
**POST** `/users`

Body:
```json
{
  "nome": "Abel",
  "idade": 20,
  "peso": 75,
  "altura": 178,
  "objetivo": "ganhar massa muscular"
}
```

### Obter utilizador
**GET** `/users/:id`

Exemplo: `GET /users/1`

---

## Chat

### Enviar mensagem (SSE)
**GET** `/chat?message=texto&user_id=1`

Exemplo: `GET /chat?message=comi uma banana&user_id=1`

### Ver histórico
**GET** `/chat/history?user_id=1`

---

## Diário alimentar

### Registar refeição
**POST** `/nutrition/parse`

Body:
```json
{
  "text": "comi 2 ovos mexidos e uma fatia de pão",
  "user_id": 1
}
```

### Ver diário
**GET** `/nutrition/diary?user_id=1`

### Apagar refeição
**DELETE** `/nutrition/diary/:id`

Exemplo: `DELETE /nutrition/diary/1`
