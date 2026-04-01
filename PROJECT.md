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
| Шаблоны    | Scriban (файлы `.sbn`)       | 7.0.6    |
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

## Структура проекта

```
graphen/
├── src/
│   ├── server/
│   │   ├── Graphen.sln
│   │   └── Graphen.Api/
│   │       ├── Controllers/
│   │       │   └── GraphController.cs          # POST /generate, GET /load
│   │       ├── Models/
│   │       │   ├── ProjectGraph.cs             # Корневая модель (ProjectName, TargetPath, Nodes, Edges)
│   │       │   ├── GraphenProject.cs           # Модель graphen.json (Version, Graph, LastGenerated)
│   │       │   ├── Node.cs                     # Нода: Id, Type, Position, Properties
│   │       │   ├── Edge.cs                     # Ребро: SourceNodeId → TargetNodeId
│   │       │   └── GeneratedFile.cs            # Результат: FileName, Content, RelativePath
│   │       ├── Services/
│   │       │   ├── ITemplateService.cs         # Загрузка Scriban-шаблонов
│   │       │   ├── TemplateService.cs          # Реализация с кешированием
│   │       │   ├── ICodeGeneratorService.cs    # Контракт генератора
│   │       │   ├── ScribanCodeGeneratorService.cs  # Генерация через шаблоны
│   │       │   ├── IProjectScaffoldService.cs  # Контракт скаффолдинга
│   │       │   └── DotnetCliScaffoldService.cs # Создание проекта через dotnet CLI
│   │       ├── Templates/                      # Scriban-шаблоны (.sbn)
│   │       │   ├── Controller.sbn
│   │       │   ├── CqrsHandler.sbn
│   │       │   ├── RequestDto.sbn
│   │       │   └── Program.sbn                 # Шаблон Program.cs для целевого проекта
│   │       └── Program.cs
│   │
│   ├── client/                                 # (планируется) Angular-фронтенд
│   │
│   └── GeneratedOutput/                        # Дефолтный вывод (в .gitignore)
│       └── {ProjectName}/
│           ├── graphen.json                    # Состояние графа
│           ├── {ProjectName}.sln
│           └── {ProjectName}/
│               ├── Controllers/  (.g.cs)
│               ├── Commands/     (.g.cs)
│               ├── Queries/      (.g.cs)
│               └── DTOs/         (.g.cs)
│
└── PROJECT.md                                  # ← Этот файл
```

## API Endpoints

### `POST /api/graph/generate`
Принимает `ProjectGraph` (JSON), генерирует код. Если целевая папка пуста — сначала создаёт базовый .NET проект через `dotnet new`.

**Request body:**
```json
{
  "projectName": "MyApi",
  "targetPath": null,
  "nodes": [...],
  "edges": [...]
}
```
- `targetPath: null` → используется `src/GeneratedOutput/{projectName}/`
- `targetPath: "C:/projects/my-api"` → генерация в указанную папку

**Response:**
```json
{
  "message": "Генерация успешно завершена!",
  "nodesProcessed": 3,
  "filesCreated": 5,
  "outputPath": "...",
  "graphenJson": "...",
  "filesData": [...]
}
```

### `GET /api/graph/load?path=...`
Загружает сохранённый граф из `graphen.json`.

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
  "sourceNodeId": "string",
  "sourceHandle": "string",
  "targetNodeId": "string",
  "targetHandle": "string"
}
```

## Типы нод

| Тип           | Что генерирует                                      | Ключевые Properties             |
|---------------|-----------------------------------------------------|---------------------------------|
| `Controller`  | Partial-класс контроллера с DI (MediatR)            | name/className, description     |
| `CqrsCommand` | Sealed class с record Command + Handler             | name, returnType                |
| `CqrsQuery`   | Sealed class с record Query + Handler               | name, returnType, httpVerb      |
| `Action`      | Метод в контроллере + Request DTO                   | name/methodName, httpVerb, route|

## Скаффолдинг

При генерации в пустую папку автоматически создаётся:
1. `dotnet new sln` — solution
2. `dotnet new webapi` — проект с контроллерами
3. `dotnet add package MediatR` — зависимость
4. Перезапись `Program.cs` шаблоном Graphen
5. Удаление дефолтного `WeatherForecast`

## Стратегия генерации кода

### Правило файлов
- **`.g.cs`** — генерируемые файлы, **перезаписываются** при каждой генерации
- **`.cs`** (без `.g.`) — пользовательский код, **никогда не трогается**

### Partial Classes
```
CreateUser.g.cs  → record Command, базовая структура (перегенерируется)
CreateUser.cs    → Handler с бизнес-логикой (пишется руками, неприкосновенен)
```

### CRUD vs Пользовательский код
- **Простые CRUD**: полностью автоматизируются через связь Command → Entity (планируется)
- **Сложная логика**: генерируется заглушка `.cs` с `throw new NotImplementedException()`
- При повторной генерации `.cs` файл **создаётся только если его ещё нет**

## Текущее состояние

### Реализовано ✅
- [x] POST `/api/graph/generate` — генерация кода по графу
- [x] GET `/api/graph/load` — загрузка graphen.json
- [x] Scriban-шаблоны в отдельных .sbn файлах
- [x] TemplateService с кешированием
- [x] Скаффолдинг через dotnet CLI (solution + webapi + MediatR)
- [x] graphen.json — сохранение/загрузка состояния графа
- [x] Опциональный targetPath (дефолт: GeneratedOutput)
- [x] Генерация контроллеров (partial, primary constructor, XML-docs)
- [x] Генерация CQRS Commands/Queries (sealed class + record + Handler)
- [x] Генерация Request DTO для Action-нод
- [x] Гибкий поиск имён (name → className → methodName)

### Планируется 🔜
- [ ] **Frontend**: Angular + визуальный редактор графов (Rete.js v2)
- [ ] Новые типы нод: Entity (с полями), Middleware, DbContext, Service
- [ ] CRUD-автогенерация: CrudCreate/Read/Update/Delete → полный Handler
- [ ] Генерация Entity + EF Core конфигурации
- [ ] Roslyn-интеграция: модификация существующего кода
- [ ] Обратный парсинг: код → граф (импорт существующего проекта)
- [ ] Выгрузка как .zip-архив
- [ ] Валидация графа
- [ ] AI-ассистент в редакторе
