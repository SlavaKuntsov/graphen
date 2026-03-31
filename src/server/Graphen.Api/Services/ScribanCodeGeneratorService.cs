using Graphen.Api.Models;
using Scriban;

namespace Graphen.Api.Services;

public class ScribanCodeGeneratorService : ICodeGeneratorService
{
    public List<GeneratedFile> GenerateProjectFiles(ProjectGraph graph, CancellationToken ct = default)
    {
        var files = new List<GeneratedFile>();
        var projectName = string.IsNullOrWhiteSpace(graph.ProjectName) ? "GraphenApp" : graph.ProjectName;

        // --- Вспомогательные функции ---
        string? GetProp(Node n, string key) => 
            n.Properties.TryGetValue(key, out var v) && v != null ? v.ToString() : null;

        string GetName(Node n) =>
            GetProp(n, "name") ?? GetProp(n, "className") ?? GetProp(n, "methodName") ?? "Unknown";
            
        string GetDescription(Node n) => 
            GetProp(n, "description") ?? "";

        // --- 1. Генерация Контроллеров ---
        var controllers = graph.Nodes.Where(n => n.Type == "Controller").ToList();

        var controllerTemplateText = @"
using Microsoft.AspNetCore.Mvc;
using MediatR;
using {{ project_name }}.Commands;
using {{ project_name }}.Queries;
using {{ project_name }}.DTOs;

namespace {{ project_name }}.Controllers;

/// <summary>
/// {{ description }}
/// </summary>
/// <param name=""mediator""></param>
[ApiController]
[Route(""api/[controller]"")]
public partial class {{ name }}Controller(IMediator mediator) : ControllerBase
{
    {{~ for action in actions ~}}

    [Http{{ action.verb }}(""{{ action.route }}"")]
    public async Task<IActionResult> {{ action.name }}([From{{ if action.verb == ""Get"" }}Query{{ else }}Body{{ end }}] {{ action.request_type }} request, CancellationToken ct = default)
    {
        var result = await mediator.Send(request);
        return Ok(result);
    }
    {{~ end ~}}
}
";
        var controllerTemplate = Template.Parse(controllerTemplateText);

        foreach (var controllerNode in controllers)
        {
            var name = GetName(controllerNode);
            var description = GetDescription(controllerNode);
            
            var connectedActionNodes = graph.Edges
                .Where(e => e.SourceNodeId == controllerNode.Id)
                .Select(e => graph.Nodes.FirstOrDefault(n => n.Id == e.TargetNodeId))
                .Where(n => n != null && (n.Type == "CqrsCommand" || n.Type == "CqrsQuery" || n.Type == "Action"))
                .ToList();

            var actions = connectedActionNodes.Select(a => {
                var actionName = GetName(a!);
                var verb = GetProp(a!, "httpVerb") ?? "Post";
                if (verb.Length > 1) verb = char.ToUpper(verb[0]) + verb[1..].ToLower();

                return new {
                    name = actionName,
                    verb = verb,
                    route = GetProp(a!, "route") ?? "",
                    request_type = a!.Type == "Action" ? $"{actionName}Request" : $"{actionName}{(a.Type == "CqrsQuery" ? "Query" : "Command")}"
                };
            }).ToList();

            var model = new { 
                project_name = projectName,
                name = name,
                description = description,
                actions = actions
            };

            files.Add(new GeneratedFile { 
               FileName = $"{name}Controller.g.cs",
               RelativePath = "Controllers",
               Content = controllerTemplate.Render(model).TrimStart()
            });
            
            // Если это просто Action (не явная команда/запрос), создаем для него Request DTO
            foreach (var actionNode in connectedActionNodes.Where(n => n!.Type == "Action"))
            {
                var actionName = GetName(actionNode!);
                files.Add(new GeneratedFile {
                    FileName = $"{actionName}Request.g.cs",
                    RelativePath = "DTOs",
                    Content = $"namespace {projectName}.DTOs;\n\npublic class {actionName}Request {{ }}"
                });
            }
        }

        // --- 2. Генерация Команд и Запросов ---
        var cqrsNodes = graph.Nodes.Where(n => n.Type == "CqrsCommand" || n.Type == "CqrsQuery").ToList();
        
        var cqrsTemplateText = @"
using MediatR;
using {{ project_name }}.DTOs;

namespace {{ project_name }}.{{ folder }};

public sealed class {{ name }} {

    public record {{ suffix }}() : IRequest<{{ return_type }}>;

    public class Handler() : IRequestHandler<{{ suffix }}, {{ return_type }}>
    {
        public Task<{{ return_type }}> Handle(Request request, CancellationToken ct = default)
        {
            throw new NotImplementedException();
        }
    }
}
";
        var cqrsTemplate = Template.Parse(cqrsTemplateText);

        foreach (var node in cqrsNodes)
        {
            var isQuery = node.Type == "CqrsQuery";
            var name = GetName(node);
            var returnType = GetProp(node, "returnType") ?? "bool";

            files.Add(new GeneratedFile {
               FileName = $"{name}{(isQuery ? "Query" : "Command")}.g.cs",
               RelativePath = isQuery ? "Queries" : "Commands",
               Content = cqrsTemplate.Render(new { 
                   project_name = projectName, 
                   folder = isQuery ? "Queries" : "Commands",
                   name = name, 
                   suffix = isQuery ? "Query" : "Command",
                   return_type = returnType 
               }).TrimStart()
            });
        }

        return files;
    }
}
