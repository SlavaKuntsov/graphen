# Graphen — Visual API Generator

> Low-Code инструмент для визуальной генерации ASP.NET Core Web API с архитектурой CQRS

## О проекте

**Graphen** позволяет проектировать API визуально — на доске с нодами и рёбрами — и получать **реальный, рабочий C#-код**. Вы строите граф из компонентов (контроллеры, команды, запросы, действия), а бэкенд генерирует готовые файлы по Scriban-шаблонам.

## Ключевые возможности

- **Визуальный граф** — ноды представляют компоненты API, рёбра задают связи между ними
- **CQRS из коробки** — автоматическая генерация Commands, Queries и Handlers с MediatR
- **Умная стратегия** — `.g.cs` файлы перезаписываются, пользовательские `.cs` файлы никогда не трогаются
- **Автоскаффолдинг** — пустая папка превращается в полноценный .NET-проект через `dotnet CLI`
- **Scriban-шаблоны** — легко кастомизировать вывод, редактируя `.sbn` файлы
- **Состояние графа** — `graphen.json` сохраняет и восстанавливает проект

## Стек технологий

| Слой | Технология | Версия |
|------|-----------|--------|
| Backend | ASP.NET Core Web API | .NET 10 |
| Шаблоны | Scriban (`.sbn`) | 7.0.6 |
| API Docs | OpenAPI + Scalar | — |
| Frontend | Angular + Rete.js v2 | 20+ |
| Будущее | Roslyn | — |

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
│     ├─ POST /generate  → скаффолдинг + генерация        │
│     └─ GET  /load      → загрузка graphen.json          │
│                                                         │
│   Services:                                             │
│     ├─ ITemplateService        → загрузка .sbn шаблонов │
│     ├─ ICodeGeneratorService   → генерация .g.cs файлов │
│     └─ IProjectScaffoldService → dotnet new (CLI)       │
│                                                         │
│   Результат: файлы в целевом проекте + graphen.json     │
└─────────────────────────────────────────────────────────┘
```

## Быстрый старт

### Запуск бэкенда

```bash
cd src/server
dotnet run
```

Сервер запустится на `http://localhost:5000` (или другом порту из конфигурации).

### Генерация проекта через API

```bash
curl -X POST http://localhost:5000/api/graph/generate \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "MyApi",
    "targetPath": null,
    "nodes": [
      {
        "id": "ctrl-1",
        "type": "Controller",
        "position": { "x": 100, "y": 100 },
        "properties": { "name": "Users", "className": "UsersController" }
      },
      {
        "id": "cmd-1",
        "type": "CqrsCommand",
        "position": { "x": 300, "y": 100 },
        "properties": { "name": "CreateUser", "returnType": "Guid" }
      }
    ],
    "edges": [
      {
        "id": "edge-1",
        "sourceNodeId": "ctrl-1",
        "sourceHandle": "output",
        "targetNodeId": "cmd-1",
        "targetHandle": "input"
      }
    ]
  }'
```

### Загрузка сохранённого графа

```bash
curl http://localhost:5000/api/graph/load?path=C:/projects/my-api/graphen.json
```

## Типы нод

| Тип | Что генерирует | Ключевые свойства |
|-----|---------------|-------------------|
| `Controller` | Partial-класс контроллера с DI (MediatR) | `name`/`className`, `description` |
| `CqrsCommand` | Sealed class с `record Command` + `Handler` | `name`, `returnType` |
| `CqrsQuery` | Sealed class с `record Query` + `Handler` | `name`, `returnType`, `httpVerb` |
| `Action` | Метод в контроллере + Request DTO | `name`/`methodName`, `httpVerb`, `route` |

## Стратегия генерации

### Правило файлов

- **`.g.cs`** — генерируемые файлы, **перезаписываются** при каждой генерации
- **`.cs`** — пользовательский код, **никогда не трогается**

### Partial Classes

```
CreateUser.g.cs  → record Command, базовая структура (перегенерируется)
CreateUser.cs    → Handler с бизнес-логикой (пишется руками, неприкосновенен)
```

### CRUD vs пользовательская логика

- **Простые CRUD** — полностью автоматизируются (планируется)
- **Сложная логика** — генерируется заглушка `.cs` с `NotImplementedException`
- При повторной генерации `.cs` создаётся **только если его ещё нет**

## Скаффолдинг

При генерации в пустую папку автоматически:

1. `dotnet new sln` — solution
2. `dotnet new webapi` — проект с контроллерами
3. `dotnet add package MediatR` — зависимость
4. Перезапись `Program.cs` шаблоном Graphen
5. Удаление дефолтного `WeatherForecast`

## Структура проекта

```
graphen/
├── src/
│   ├── server/
│   │   ├── Graphen.sln
│   │   └── Graphen.Api/
│   │       ├── Controllers/
│   │       │   └── GraphController.cs
│   │       ├── Models/
│   │       │   ├── ProjectGraph.cs
│   │       │   ├── GraphenProject.cs
│   │       │   ├── Node.cs
│   │       │   ├── Edge.cs
│   │       │   └── GeneratedFile.cs
│   │       ├── Services/
│   │       │   ├── ITemplateService.cs
│   │       │   ├── TemplateService.cs
│   │       │   ├── ICodeGeneratorService.cs
│   │       │   ├── ScribanCodeGeneratorService.cs
│   │       │   ├── IProjectScaffoldService.cs
│   │       │   └── DotnetCliScaffoldService.cs
│   │       ├── Templates/
│   │       │   ├── Controller.sbn
│   │       │   ├── CqrsHandler.sbn
│   │       │   ├── RequestDto.sbn
│   │       │   └── Program.sbn
│   │       └── Program.cs
│   │
│   ├── client/                          # Angular-фронтенд (Rete.js v2)
│   │
│   └── GeneratedOutput/                 # Дефолтный вывод (в .gitignore)
│       └── {ProjectName}/
│           ├── graphen.json
│           ├── {ProjectName}.sln
│           └── {ProjectName}/
│               ├── Controllers/  (.g.cs)
│               ├── Commands/     (.g.cs)
│               ├── Queries/      (.g.cs)
│               └── DTOs/         (.g.cs)
│
└── README.md
```

## Модель данных

### ProjectGraph

```json
{
  "projectName": "string",
  "targetPath": "string | null",
  "nodes": [Node],
  "edges": [Edge]
}
```

### GraphenProject (graphen.json)

```json
{
  "version": "1.0",
  "projectName": "string",
  "lastGenerated": "ISO 8601",
  "graph": { ProjectGraph }
}
```

## Текущее состояние

### Реализовано

- [x] `POST /api/graph/generate` — генерация кода по графу
- [x] `GET /api/graph/load` — загрузка graphen.json
- [x] Scriban-шаблоны в отдельных `.sbn` файлах
- [x] TemplateService с кешированием
- [x] Скаффолдинг через dotnet CLI (solution + webapi + MediatR)
- [x] graphen.json — сохранение/загрузка состояния графа
- [x] Опциональный targetPath (дефолт: GeneratedOutput)
- [x] Генерация контроллеров (partial, primary constructor, XML-docs)
- [x] Генерация CQRS Commands/Queries (sealed class + record + Handler)
- [x] Генерация Request DTO для Action-нод
- [x] Гибкий поиск имён (name → className → methodName)
- [x] **Frontend**: Angular 20+ визуальный редактор графов (Rete.js v2) с премиум-дизайном и интеллектуальным авто-лейаутом

### Планируется

- [ ] Новые типы нод: Entity (с полями), Middleware, DbContext, Service
- [ ] CRUD-автогенерация: CrudCreate/Read/Update/Delete → полный Handler
- [ ] Генерация Entity + EF Core конфигурации
- [ ] Roslyn-интеграция: модификация существующего кода
- [ ] Обратный парсинг: код → граф (импорт существующего проекта)
- [ ] Выгрузка как .zip-архив
- [ ] Валидация графа
