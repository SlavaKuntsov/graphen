# Graphen — Visual API Generator

## Концепция

**Graphen** — кастомный Low-Code инструмент для визуальной генерации ASP.NET Core Web API с архитектурой CQRS.

Пользователь работает с **визуальной доской** (canvas), на которой располагает **ноды** (узлы графа), представляющие компоненты API: точку входа (Program.cs), контроллеры, CQRS-команды, запросы, обработчики и т.д. Ноды соединяются **рёбрами**, формируя структуру будущего приложения.

Результат — **реальный, рабочий C#-код**, сгенерированный на бэкенде по Scriban-шаблонам (а в дальнейшем — через Roslyn для модификации существующего кода).

## Стек технологий

| Слой       | Технология                   | Версия   |
|------------|------------------------------|----------|
| Frontend   | Angular (планируется)        | 20+      |
| Backend    | ASP.NET Core Web API         | .NET 10  |
| Шаблоны    | Scriban                      | 7.0.6    |
| API Docs   | OpenAPI + Scalar             | —        |
| Будущее    | Roslyn (Microsoft.CodeAnalysis) | —     |

## Архитектура

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Angular)                    │
│                                                         │
│   ┌─────────┐    ┌──────────┐    ┌────────────────┐     │
│   │ Program │───▶│Controller│───▶│ CqrsCommand    │     │
│   │  (node) │    │  (node)  │    │ CqrsQuery      │     │
│   └─────────┘    └──────────┘    │ Action (node)   │     │
│                                  └────────────────┘     │
│                                                         │
│   Итог: JSON-контракт (ProjectGraph)                    │
└──────────────────────┬──────────────────────────────────┘
                       │ POST /api/graph/generate
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   BACKEND (ASP.NET Core)                 │
│                                                         │
│   GraphController                                       │
│     └─ ICodeGeneratorService                            │
│          └─ ScribanCodeGeneratorService                  │
│               ├─ Парсинг графа (Nodes + Edges)          │
│               ├─ Генерация Controllers (.g.cs)          │
│               ├─ Генерация Commands / Queries (.g.cs)   │
│               └─ Генерация DTOs (.g.cs)                 │
│                                                         │
│   Результат: файлы в src/GeneratedOutput/{ProjectName}/ │
└─────────────────────────────────────────────────────────┘
```

## Структура проекта

```
graphen/
├── src/
│   ├── server/
│   │   ├── Graphen.sln
│   │   └── Graphen.Api/
│   │       ├── Controllers/
│   │       │   └── GraphController.cs          # Единственный эндпоинт: POST /api/graph/generate
│   │       ├── Models/
│   │       │   ├── ProjectGraph.cs             # Корневая модель графа (ProjectName, Nodes, Edges)
│   │       │   ├── Node.cs                     # Нода: Id, Type, Position, Properties (Dictionary)
│   │       │   ├── Edge.cs                     # Ребро: SourceNodeId → TargetNodeId (+ Handles)
│   │       │   └── GeneratedFile.cs            # Результат генерации: FileName, Content, RelativePath
│   │       ├── Services/
│   │       │   ├── ICodeGeneratorService.cs    # Контракт генератора
│   │       │   └── ScribanCodeGeneratorService.cs  # Реализация через Scriban-шаблоны
│   │       └── Program.cs
│   │
│   ├── client/                                 # (планируется) Angular-фронтенд с визуальным редактором
│   │
│   └── GeneratedOutput/                        # Сюда пишется результат генерации (в .gitignore)
│       └── {ProjectName}/
│           ├── Controllers/
│           ├── Commands/
│           ├── Queries/
│           └── DTOs/
│
└── PROJECT.md                                  # ← Этот файл
```

## Модель данных (JSON-контракт)

### ProjectGraph
```json
{
  "projectName": "string",
  "nodes": [Node],
  "edges": [Edge]
}
```

### Node
```json
{
  "id": "string (GUID)",
  "type": "Controller | CqrsCommand | CqrsQuery | Action",
  "position": { "x": 0, "y": 0 },
  "properties": {
    "name": "string",
    "className": "string (альтернатива name)",
    "methodName": "string (альтернатива name)",
    "description": "string",
    "httpVerb": "GET | POST | PUT | DELETE",
    "route": "string",
    "returnType": "string"
  }
}
```

### Edge
```json
{
  "id": "string",
  "sourceNodeId": "string (ID ноды-источника)",
  "sourceHandle": "string (порт/пин на ноде)",
  "targetNodeId": "string (ID ноды-приёмника)",
  "targetHandle": "string (порт/пин на ноде)"
}
```

## Типы нод (Node Types)

| Тип           | Что генерирует                                      | Ключевые Properties             |
|---------------|-----------------------------------------------------|---------------------------------|
| `Controller`  | Partial-класс контроллера с DI (MediatR)            | name/className, description     |
| `CqrsCommand` | Sealed class с record Command + Handler             | name, returnType                |
| `CqrsQuery`   | Sealed class с record Query + Handler               | name, returnType, httpVerb      |
| `Action`      | Метод в контроллере + Request DTO                   | name/methodName, httpVerb, route|

## Текущее состояние (MVP)

### Реализовано ✅
- [x] Бэкенд: приём JSON-графа через POST `/api/graph/generate`
- [x] Генерация контроллеров через Scriban-шаблоны (partial class, primary constructor)
- [x] Генерация CQRS-команд и запросов (sealed class + record + Handler)
- [x] Генерация Request DTO для Action-нод
- [x] Гибкий поиск имён (name → className → methodName)
- [x] XML-документация в сгенерированном коде
- [x] Поддержка HTTP-методов (GET → FromQuery, остальные → FromBody)
- [x] Вывод результата в `src/GeneratedOutput/`

### Планируется 🔜
- [ ] **Frontend**: Angular-приложение с визуальным редактором графов (Rete.js / jsPlumb / ngx-graph)
- [ ] Новые типы нод: Middleware, Entity, DbContext, Service, DTO-поля
- [ ] Генерация Program.cs (DI-регистрация, pipeline)
- [ ] Генерация Entity + DbContext через Scriban
- [ ] Roslyn-интеграция: модификация существующего кода (добавление методов в контроллер)
- [ ] Выгрузка результата как .zip-архив
- [ ] Валидация графа (нельзя подключить Handler напрямую к Program.cs)
- [ ] Синхронизация графа с существующей директорией

## Философия генерации кода
1. **Partial classes** — сгенерированный код отделяется от ручного. Файлы имеют суффикс `.g.cs`.
2. **Scriban для новых файлов** — быстро, безопасно, предсказуемо.
3. **Roslyn для существующих файлов** (будущее) — парсинг AST, точечная вставка, сохранение форматирования.
4. **Граф = единственный источник истины** — всегда можно перегенерировать весь проект заново.
