using Graphen.Api.Models;
using Microsoft.AspNetCore.Mvc;

using Graphen.Api.Services;

namespace Graphen.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class GraphController(
    ILogger<GraphController> logger, 
    ICodeGeneratorService generatorService, 
    IWebHostEnvironment env) : ControllerBase
{
    [HttpPost("generate")]
    public IActionResult GenerateModels([FromBody] ProjectGraph graph, CancellationToken ct = default)
    {
        logger.LogInformation("Received graph for project: {ProjectName}", graph.ProjectName);
        logger.LogInformation("Total Nodes: {NodesCount}, Total Edges: {EdgesCount}", graph.Nodes.Count, graph.Edges.Count);

        // 1. Генерируем файлы через Scriban
        var files = generatorService.GenerateProjectFiles(graph);

        // 2. Сохраняем физически на диск (для демонстрации)
        // В продакшене лучше возвращать .zip архив или выводить в отдельную папку
        var outputDir = Path.Combine(env.ContentRootPath, "..", "..", "GeneratedOutput", graph.ProjectName ?? "MyProject");
        if (Directory.Exists(outputDir)) Directory.Delete(outputDir, true);
        
        foreach (var file in files)
        {
            var dirPath = Path.Combine(outputDir, file.RelativePath);
            Directory.CreateDirectory(dirPath);
            var filePath = Path.Combine(dirPath, file.FileName);
            
            System.IO.File.WriteAllText(filePath, file.Content);
        }

        return Ok(new 
        { 
            message = "Генерация успешно завершена!", 
            nodesProcessed = graph.Nodes.Count,
            filesCreated = files.Count,
            outputPath = outputDir,
            filesData = files.Select(f => new { f.FileName, f.RelativePath })
        });
    }
}
