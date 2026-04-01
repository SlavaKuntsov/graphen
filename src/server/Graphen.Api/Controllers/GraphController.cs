using System.Text.Encodings.Web;
using System.Text.Json;
using Graphen.Api.Models;
using Microsoft.AspNetCore.Mvc;

using Graphen.Api.Services;

namespace Graphen.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public sealed class GraphController(
    ILogger<GraphController> logger, 
    ICodeGeneratorService generatorService, 
    IProjectScaffoldService scaffoldService,
    IWebHostEnvironment env) : ControllerBase
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    /// <summary>
    /// Генерация кода по графу. Если целевая директория пустая — создаёт базовый .NET проект.
    /// </summary>
    [HttpPost("generate")]
    public async Task<IActionResult> GenerateModels([FromBody] ProjectGraph graph, CancellationToken ct = default)
    {
        var projectName = string.IsNullOrWhiteSpace(graph.ProjectName) ? "MyProject" : graph.ProjectName;
        
        logger.LogInformation("Received graph for project: {ProjectName}", projectName);
        logger.LogInformation("Total Nodes: {NodesCount}, Total Edges: {EdgesCount}", graph.Nodes.Count, graph.Edges.Count);

        // 1. Определяем целевую директорию
        var outputDir = !string.IsNullOrWhiteSpace(graph.TargetPath)
            ? graph.TargetPath
            : Path.Combine(env.ContentRootPath, "..", "..", "GeneratedOutput", projectName);
        
        outputDir = Path.GetFullPath(outputDir);

        // 2. Скаффолдинг если нужно
        if (scaffoldService.NeedsScaffold(outputDir))
        {
            logger.LogInformation("Целевая директория пуста — запускаем скаффолдинг в {OutputDir}", outputDir);
            await scaffoldService.ScaffoldAsync(outputDir, projectName, ct);
        }

        // 3. Генерируем файлы через Scriban
        var files = generatorService.GenerateProjectFiles(graph, ct);

        // 4. Очистка старых сгенерированных файлов (*.g.cs)
        // Чтобы в проекте не оставалось "мусора" от удаленных нод
        var projectSubDir = Path.Combine(outputDir, projectName);
        if (Directory.Exists(projectSubDir))
        {
            var oldGeneratedFiles = Directory.GetFiles(projectSubDir, "*.g.cs", SearchOption.AllDirectories);
            foreach (var oldFile in oldGeneratedFiles)
            {
                System.IO.File.Delete(oldFile);
            }
        }

        // 5. Сохраняем сгенерированные файлы
        foreach (var file in files)
        {
            var dirPath = Path.Combine(projectSubDir, file.RelativePath);
            Directory.CreateDirectory(dirPath);
            var filePath = Path.Combine(dirPath, file.FileName);
            
            // Если это генерируемый файл (.g.cs), то всегда перезаписываем.
            // Если это затычка (.cs), то пишем только если её еще нет (чтобы не затереть код юзера).
            if (file.FileName.EndsWith(".g.cs") || !System.IO.File.Exists(filePath))
            {
                await System.IO.File.WriteAllTextAsync(filePath, file.Content, ct);
            }
        }

        // 5. Сохраняем graphen.json
        var graphenProject = new GraphenProject
        {
            ProjectName = projectName,
            LastGenerated = DateTime.UtcNow,
            Graph = graph
        };
        
        var graphenJsonPath = Path.Combine(outputDir, "graphen.json");
        var json = JsonSerializer.Serialize(graphenProject, JsonOptions);
        await System.IO.File.WriteAllTextAsync(graphenJsonPath, json, ct);

        logger.LogInformation("graphen.json сохранён: {Path}", graphenJsonPath);

        return Ok(new 
        { 
            message = "Генерация успешно завершена!", 
            nodesProcessed = graph.Nodes.Count,
            filesCreated = files.Count,
            outputPath = outputDir,
            graphenJson = graphenJsonPath,
            filesData = files.Select(f => new { f.FileName, f.RelativePath })
        });
    }

    /// <summary>
    /// Загрузить граф из существующего graphen.json.
    /// </summary>
    [HttpGet("load")]
    public async Task<IActionResult> LoadProject([FromQuery] string? path, CancellationToken ct = default)
    {
        var targetPath = !string.IsNullOrWhiteSpace(path)
            ? path
            : Path.Combine(env.ContentRootPath, "..", "..", "GeneratedOutput");

        targetPath = Path.GetFullPath(targetPath);

        // Ищем graphen.json в указанной папке или в подпапках
        var graphenJsonPath = Path.Combine(targetPath, "graphen.json");
        
        if (!System.IO.File.Exists(graphenJsonPath))
        {
            // Попробуем найти в первой подпапке
            var subDirs = Directory.Exists(targetPath) 
                ? Directory.GetDirectories(targetPath) 
                : [];
                
            graphenJsonPath = subDirs
                .Select(d => Path.Combine(d, "graphen.json"))
                .FirstOrDefault(System.IO.File.Exists) ?? "";

            if (string.IsNullOrEmpty(graphenJsonPath))
                return NotFound(new { message = $"graphen.json не найден в {targetPath}" });
        }

        var json = await System.IO.File.ReadAllTextAsync(graphenJsonPath, ct);
        var project = JsonSerializer.Deserialize<GraphenProject>(json, JsonOptions);

        return Ok(project);
    }
}
