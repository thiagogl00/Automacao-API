# Relatório técnico — KathFlix

## 1. Resumo executivo

O KathFlix é uma aplicação web monolítica para catálogo de filmes e séries, desenvolvida com Node.js, Express, SQLite e frontend estático em HTML/CSS/JavaScript.

O projeto está funcional e possui boa cobertura de testes: **56 testes executados com sucesso**. Também não foram encontradas vulnerabilidades conhecidas pelo `npm audit`.

Entretanto, **não está pronto para produção** sem ajustes importantes, principalmente porque a API de testes fica habilitada por padrão e permite alterar ou resetar o banco sem autenticação.

### Avaliação geral

| Área | Avaliação |
|---|---|
| Funcionalidade | Boa |
| Organização | Boa para projeto de pequeno porte |
| Testes | Boa |
| Segurança | Insuficiente para produção |
| Escalabilidade | Limitada |
| Operação | Básica |
| Documentação | Boa, com OpenAPI e Postman |
| Maturidade geral | Projeto educacional funcional |

---

## 2. Arquitetura

A aplicação utiliza uma arquitetura monolítica:

```text
Browser
  |
  | HTTP / JSON / multipart
  v
Express
  |
  +-- Autenticação e sessões
  +-- Catálogo
  +-- Favoritos
  +-- Perfil
  +-- Administração
  +-- API de testes
  |
  v
SQLite
```

### Componentes principais

- Inicialização do servidor: `server.js`
- Configuração do Express: `src/app.js`
- Persistência SQLite: `src/db.js`
- Regras de títulos: `src/titles-service.js`
- Regras de usuários: `src/users-service.js`
- Uploads: `src/upload.js`
- Autenticação: `src/middleware/auth.js`
- Contrato da API: `openapi.yaml`

A separação entre rotas, serviços, middleware e persistência é adequada para o tamanho atual do projeto.

---

## 3. Backend

### Tecnologias

Declaradas em `package.json`:

- Node.js `>=22.13`
- Express
- SQLite nativo via `node:sqlite`
- bcryptjs
- Multer
- Swagger UI
- YAML

O `tsconfig.json` existe, mas o código executável é JavaScript. Atualmente não há pipeline TypeScript efetivamente utilizado.

### Inicialização

O servidor:

- cria automaticamente o diretório `data`;
- usa `PORT` ou porta `3000`;
- usa `KATHFLIX_DB` para configurar o banco;
- inicializa o schema e executa seed automático.

Referência: `server.js` e `src/db.js`.

### Tratamento de erros

O tratamento centralizado em `src/errors.js` padroniza respostas no formato:

```json
{
  "error": "mensagem"
}
```

São tratados:

- erros de domínio;
- JSON inválido;
- erros do Multer;
- erros HTTP;
- erros internos com log no console.

Esse padrão é consistente com o contrato OpenAPI.

---

## 4. Modelo de dados

O banco SQLite contém as seguintes entidades:

| Tabela | Responsabilidade |
|---|---|
| `users` | Usuários, credenciais, perfil e papel |
| `titles` | Filmes e séries |
| `episodes` | Episódios de séries |
| `favorites` | Relação usuário/título favorito |
| `lucky_cats` | Progresso dos gatos por usuário |
| `sessions` | Tokens de autenticação |

O modelo utiliza:

- chaves primárias;
- chaves estrangeiras;
- `ON DELETE CASCADE`;
- unicidade de e-mail;
- chave composta para favoritos e gatos.

O `PRAGMA foreign_keys = ON` é habilitado corretamente.

### Pontos positivos

- O hash da senha não é exposto pelas respostas públicas.
- Favoritos são idempotentes.
- Exclusões removem registros dependentes.
- O seed inicial é automatizado.
- O reset do banco é coberto por testes.

### Limitações

1. Não há migrações versionadas.
2. Não há mecanismo de evolução de schema.
3. Não existem índices específicos para buscas frequentes.
4. Não há constraints SQL para `role`, `type` ou `genre`.
5. A inserção de um título e seus episódios não é transacional em `src/titles-service.js`.

Em caso de falha durante a inserção de episódios, pode existir um título parcialmente criado.

---

## 5. Autenticação e autorização

A autenticação está implementada com tokens aleatórios armazenados na tabela `sessions`.

Fluxo:

1. Login compara a senha com bcrypt.
2. Um UUID é gerado.
3. O UUID é salvo no banco.
4. O cliente envia `Authorization: Bearer <token>`.
5. O middleware localiza o usuário e atualiza `last_seen_at`.

Referências:

- `src/routes/auth.js`
- `src/middleware/auth.js`

### Pontos positivos

- Senhas são armazenadas com bcrypt.
- Rotas protegidas exigem token.
- Rotas administrativas exigem papel `admin`.
- Logout invalida o token atual.
- Usuário comum não pode acessar rotas administrativas.
- O próprio administrador não pode se remover.

### Riscos

#### Alta prioridade — sessões sem expiração

O campo `last_seen_at` é atualizado, mas não existe validação de expiração no middleware. Portanto, um token pode permanecer válido indefinidamente até logout ou remoção do usuário.

Recomendação:

- definir TTL de sessão;
- invalidar sessões antigas;
- revogar todas as sessões após troca de senha;
- considerar hash do token no banco em vez do token puro.

#### Média prioridade — armazenamento do token no `localStorage`

O frontend armazena o token em `localStorage` por meio de `public/js/common.js`.

Isso aumenta o impacto de uma eventual vulnerabilidade XSS. Para uma aplicação de produção, seria preferível:

- cookie `HttpOnly`;
- `Secure`;
- `SameSite`;
- proteção CSRF quando aplicável.

---

## 6. API

A API cobre:

- autenticação;
- catálogo;
- favoritos;
- perfil;
- administração;
- gatos da sorte;
- suporte a testes.

O contrato está documentado em `openapi.yaml`, e os testes verificam se os endpoints documentados existem.

A documentação Swagger é publicada em:

```text
/api-docs
/api-docs/openapi.yaml
```

### Pontos positivos

- Contrato OpenAPI disponível.
- Coleção Postman disponível em `postman/KathFlix.postman_collection.json`.
- Validação de tipos, ano, gênero e links do YouTube.
- Proteção contra curingas em filtros SQL.
- Limite de tamanho do corpo JSON.
- Respostas de erro padronizadas.

### Limitações

- Não há paginação no catálogo.
- Listagens podem crescer sem limite.
- Não há versionamento da API, como `/api/v1`.
- Não há limite de requisições.
- Não há rastreamento estruturado de requisições.
- Não há correlação de erros por request ID.

---

## 7. Risco crítico: API de testes exposta

A configuração em `src/app.js` habilita a API de testes por padrão:

```js
app.locals.testApi = testApi !== undefined
  ? testApi
  : process.env.KATHFLIX_TEST_API !== 'off';
```

As rotas em `src/routes/test-support.js` não exigem autenticação e permitem:

- resetar completamente o banco;
- criar usuários;
- criar títulos;
- criar usuários administrativos;
- apagar dados por prefixo.

Isso significa que, em uma execução padrão, qualquer pessoa que consiga acessar a aplicação pode potencialmente:

1. apagar o banco;
2. criar uma conta administrativa;
3. alterar o conteúdo do catálogo;
4. remover usuários e títulos.

### Classificação

**Crítico — bloqueador para produção.**

### Recomendação

Alterar o comportamento padrão para desligado:

```text
KATHFLIX_TEST_API=on
```

A API de testes deveria ser habilitada somente quando explicitamente solicitada e, idealmente:

- apenas em ambiente de teste;
- protegida por autenticação administrativa;
- bloqueada fora de `NODE_ENV=test`;
- indisponível em deployments públicos.

---

## 8. Uploads

O upload está implementado com Multer em `src/upload.js`.

Controles existentes:

- limite de 2 MB;
- whitelist de extensões;
- validação do MIME type;
- nome aleatório;
- remoção de arquivo órfão após falha do handler.

Esses controles são positivos e estão cobertos por testes em `test/hardening.test.js`.

### Pontos de atenção

A validação depende da extensão e do MIME type informado pelo cliente. Não há validação de conteúdo real, como assinatura/magic bytes.

Recomendações:

- validar o conteúdo real da imagem;
- reprocessar imagens com biblioteca segura;
- remover metadados EXIF quando necessário;
- armazenar uploads fora do diretório público;
- servir arquivos por endpoint controlado ou CDN;
- aplicar políticas de cache e Content Security Policy.

---

## 9. Frontend

O frontend é servido como conteúdo estático em `public/`.

Principais páginas:

- login;
- cadastro;
- home;
- reprodução;
- perfil;
- administração;
- gatos da sorte.

### Pontos positivos

- Uso consistente de `textContent` em várias telas.
- Função `KF.esc` para escaping de HTML.
- Navegação protegida no cliente.
- Tratamento centralizado de chamadas HTTP.
- Interface de administração funcional.
- Integração com player do YouTube.
- Layout responsivo básico.

### Limitações

- A autorização real depende exclusivamente do backend, corretamente; porém a proteção visual do frontend não deve ser considerada controle de segurança.
- Token em `localStorage`.
- Ausência de CSP, HSTS e demais headers de segurança.
- Não há mecanismo de observabilidade de erros no navegador.
- Alguns comportamentos de gamificação estão deliberadamente acoplados à interface e dificultam a manutenção.
- O fluxo “esqueci a senha” não implementa recuperação real; apenas exibe uma mensagem informativa em `public/js/login.js`.

---

## 10. Segurança

### Controles existentes

- bcrypt para senhas;
- autenticação Bearer;
- autorização por papel;
- SQL parametrizado;
- escaping de dados no frontend;
- limite de upload;
- validação de extensão;
- limite de corpo JSON;
- foreign keys;
- testes de hardening;
- ausência de vulnerabilidades reportadas pelo `npm audit`.

### Lacunas principais

| Severidade | Problema |
|---|---|
| Crítica | API de testes habilitada por padrão e sem autenticação |
| Alta | Sessões sem expiração |
| Média | Tokens em `localStorage` |
| Média | Ausência de rate limiting para login |
| Média | Ausência de headers de segurança |
| Média | Upload sem validação por assinatura de conteúdo |
| Média | Credenciais seed conhecidas e documentadas |
| Baixa/Média | Sem política de auditoria ou logs estruturados |
| Baixa/Média | Sem validação de integridade no nível SQL |

As credenciais padrão estão documentadas no OpenAPI:

```text
admin@kathflix.com / admin123
user@kathflix.com / user123
```

Isso é aceitável para treinamento, mas deve ser removido, alterado ou forçado a mudar em qualquer ambiente não local.

---

## 11. Testes e qualidade

A suíte utiliza o runner nativo do Node.js.

Comando executado:

```bash
npm test
```

Resultado:

```text
56 testes
56 aprovados
0 falhas
```

A cobertura inclui:

- autenticação;
- logout;
- autorização;
- usuários;
- favoritos;
- catálogo;
- episódios;
- uploads;
- SQLite;
- API de testes;
- gatos da sorte;
- OpenAPI;
- validações de entrada;
- payloads grandes;
- limpeza de arquivos órfãos.

### Pontos faltantes

Não foram identificados testes automatizados para:

- expiração de sessão;
- concorrência de login;
- rate limiting;
- falha de banco;
- corrupção ou indisponibilidade do arquivo SQLite;
- encerramento gracioso do servidor;
- testes de browser ponta a ponta;
- acessibilidade;
- performance;
- segurança de headers;
- upload com conteúdo falso usando extensão válida.

Também não há scripts de lint, format, build ou type-check no `package.json`.

---

## 12. Operação e produção

### Pontos atuais

- Configuração por variáveis de ambiente.
- Banco persistente em arquivo.
- Diretório de upload criado automaticamente.
- Health check disponível em `/api/health`.
- Swagger disponível.

### Ausências

- graceful shutdown;
- logs estruturados;
- métricas;
- tracing;
- backup automático do SQLite;
- rotação de logs;
- monitoramento de espaço em disco;
- health check profundo do banco;
- configuração explícita de ambiente;
- containerização;
- pipeline CI/CD;
- migrações;
- estratégia de rollback.

A implementação atual é adequada para desenvolvimento local, testes automatizados e demonstrações, mas precisa de uma camada operacional antes de ser publicada.

---

## 13. Recomendações priorizadas

### P0 — antes de qualquer publicação

1. Desabilitar `/api/test` por padrão.
2. Impedir que a API de testes seja ativada em produção.
3. Remover ou alterar credenciais seed fora de ambiente local.
4. Implementar expiração de sessão.
5. Adicionar rate limiting ao login.
6. Adicionar headers de segurança, especialmente CSP, HSTS e `X-Content-Type-Options`.

### P1 — próxima iteração

1. Usar cookie `HttpOnly` em vez de `localStorage`.
2. Tornar criação de título e episódios transacional.
3. Validar magic bytes dos uploads.
4. Criar índices para catálogo e sessões.
5. Adicionar paginação.
6. Implementar logs estruturados.
7. Criar testes de expiração, concorrência e segurança de produção.
8. Adicionar scripts de lint e formatação.

### P2 — evolução arquitetural

1. Adicionar migrações versionadas.
2. Separar configuração por ambiente.
3. Implementar observabilidade.
4. Criar pipeline CI/CD.
5. Avaliar PostgreSQL caso o volume cresça.
6. Externalizar arquivos para storage próprio ou CDN.
7. Adicionar testes E2E reais com Playwright.
8. Implementar recuperação de senha e política de troca de credenciais.

---

## 14. Conclusão

O KathFlix cumpre bem o objetivo de ser uma aplicação de treinamento para automação com Playwright. A implementação é simples, legível, modularizada e possui uma suíte de testes acima da média para um projeto desse porte.

Os principais riscos estão concentrados em segurança operacional, especialmente:

- API de testes pública por padrão;
- sessões sem expiração;
- credenciais seed previsíveis;
- ausência de controles de produção.

Com a correção desses pontos, a inclusão de observabilidade, transações e uma estratégia de deploy, o projeto terá uma base significativamente mais segura e sustentável.

