using Graphen.Api.Models;
using Scriban;

namespace Graphen.Api.Services;

public class ScribanCodeGeneratorService : ICodeGeneratorService
{
    public List<GeneratedFile> GenerateProjectFiles(ProjectGraph graph)
    {
        var files = new List<GeneratedFile>();
        var projectName = string.IsNullOrWhiteSpace(graph.ProjectName) ? "GraphenApp" : graph.ProjectName;

        // --- 1. Генерация Контроллеров ---
        var controllers = graph.Nodes.Where(n => n.Type == "Controller").ToList();

        var controllerTemplateText = @"
using Microsoft.AspNetCore.Mvc;
using MediatR;
using {{ project_name }}.Commands;

namespace {{ project_name }}.Controllers;

[ApiController]
[Route(""api/[controller]"")]
public partial class {{ name }}Controller : ControllerBase
{
    private readonly IMediator _mediator;

    public {{ name }}Controller(IMediator mediator)
    {
        _mediator = mediator;
    }
    {{~ for action in actions ~}}

    [HttpPost(""{{ action.name }}"")]
    public async Task<IActionResult> {{ action.name }}([FromBody] {{ action.name }}Command command)
    {
        var result = await _mediator.Send(command);
        return Ok(result);
    }
    {{~ end ~}}
}
";
        var controllerTemplate = Template.Parse(controllerTemplateText);

        foreach (var controllerNode in controllers)
        {
            var name = controllerNode.Properties.GetValueOrDefault("name")?.ToString() ?? "Unknown";
            
            // Ищем все связи, которые исходят из этого контроллера
            var connectedCommandNodes = graph.Edges
                .Where(e => e.SourceNodeId == controllerNode.Id)
                .Select(e => graph.Nodes.FirstOrDefault(n => n.Id == e.TargetNodeId))
                .Where(n => n != null && n.Type == "CqrsCommand")
                .ToList();

            // Формируем список экшенов (действий) для контроллера
            var actions = connectedCommandNodes.Select(c => new
            {
                name = c!.Properties.GetValueOrDefault("name")?.ToString() ?? "Unknown",
                return_type = c.Properties.GetValueOrDefault("returnType")?.ToString() ?? "void"
            }).ToList();

            var model = new { 
                project_name = projectName,
                name = name,
                actions = actions
            };

            var content = controllerTemplate.Render(model);

            files.Add(new GeneratedFile 
            { 
               FileName = $"{name}Controller.g.cs",
               RelativePath = "Controllers",
               Content = content.TrimStart()
            });
        }

        // --- 2. Генерация CQRS Команд ---
        var commands = graph.Nodes.Where(n => n.Type == "CqrsCommand").ToList();
        
        var commandTemplateText = @"
using MediatR;

namespace {{ project_name }}.Commands;

public record {{ name }}Command : IRequest<{{ return_type }}>
{
    // TODO: Свойства команды (из дополнительных настроек узла)
}
";
        var commandTemplate = Template.Parse(commandTemplateText);

        foreach (var commandNode in commands)
        {
            var name = commandNode.Properties.GetValueOrDefault("name")?.ToString() ?? "Unknown";
            var returnType = commandNode.Properties.GetValueOrDefault("returnType")?.ToString() ?? "void";
            if (returnType == "void") returnType = "Unit"; // Для MediatR

            var model = new { 
                project_name = projectName,
                name = name,
                return_type = returnType
            };

            var content = commandTemplate.Render(model);

            files.Add(new GeneratedFile 
            { 
               FileName = $"{name}Command.g.cs",
               RelativePath = "Commands",
               Content = content.TrimStart()
            });
        }

        return files;
    }
}
