using Graphen.Api.Models;

namespace Graphen.Api.Services;

public class ScribanCodeGeneratorService(ITemplateService templateService) : ICodeGeneratorService
{
    public List<GeneratedFile> GenerateProjectFiles(ProjectGraph graph, CancellationToken ct = default)
    {
        var files = new List<GeneratedFile>();
        var projectName = string.IsNullOrWhiteSpace(graph.ProjectName) ? "GraphenApp" : graph.ProjectName;

        string GetName(Node n) =>
            n.Properties.Name ?? n.Properties.ClassName ?? n.Properties.MethodName ?? "Unknown";
            
        string GetDescription(Node n) => 
            n.Properties.Description ?? "";

        // --- 1. Генерация Контроллеров ---
        var controllerTemplate = templateService.GetTemplate("Controller");
        var partialStubActionTemplate = templateService.GetTemplate("PartialStubAction");
        var controllers = graph.Nodes.Where(n => n.Type == NodeType.Controller).ToList();

        foreach (var controllerNode in controllers)
        {
            var name = GetName(controllerNode);
            var description = GetDescription(controllerNode);
            
            var connectedActionNodes = graph.Edges
                .Where(e => e.SourceNodeId == controllerNode.Id)
                .Select(e => graph.Nodes.FirstOrDefault(n => n.Id == e.TargetNodeId))
                .Where(n => n != null && (n.Type == NodeType.CqrsCommand || n.Type == NodeType.CqrsQuery || n.Type == NodeType.Action))
                .ToList();

            var actions = connectedActionNodes.Select(a => {
                var actionName = GetName(a!);
                var verb = a!.Properties.HttpVerb ?? "Post";
                if (verb.Length > 1) verb = char.ToUpper(verb[0]) + verb[1..].ToLower();

                return new {
                    name = actionName,
                    verb = verb,
                    request_type = a!.Type == NodeType.Action ? $"{actionName}Request" : $"{actionName}.{(a.Type == NodeType.CqrsQuery ? "Query" : "Command")}",
                    is_cqrs = a.Type == NodeType.CqrsCommand || a.Type == NodeType.CqrsQuery,
                    generate_cs = (a.Properties.GenerateFileExtension?.Trim() ?? ".g.cs").Equals(".cs", StringComparison.OrdinalIgnoreCase)
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
            var requestDtoTemplate = templateService.GetTemplate("RequestDto");
            foreach (var actionNode in connectedActionNodes.Where(n => n!.Type == NodeType.Action))
            {
                var actionName = GetName(actionNode!);
                files.Add(new GeneratedFile {
                    FileName = $"{actionName}Request.g.cs",
                    RelativePath = "DTOs",
                    Content = requestDtoTemplate.Render(new { project_name = projectName, name = actionName }).TrimStart()
                });

                var ext = actionNode!.Properties.GenerateFileExtension?.Trim() ?? ".g.cs";
                if (ext.Equals(".cs", StringComparison.OrdinalIgnoreCase))
                {
                    files.Add(new GeneratedFile {
                        FileName = $"{name}Controller.{actionName}.cs",
                        RelativePath = "Controllers",
                        Content = partialStubActionTemplate.Render(new {
                            project_name = projectName,
                            controller_name = name,
                            name = actionName,
                            verb = actionNode!.Properties.HttpVerb ?? "Post",
                            request_type = $"{actionName}Request"
                        }).TrimStart()
                    });
                }
            }
        }

        // --- 2. Генерация Команд и Запросов ---
        var cqrsTemplate = templateService.GetTemplate("CqrsHandler");
        var partialStubCqrsTemplate = templateService.GetTemplate("PartialStubCqrs");
        var cqrsNodes = graph.Nodes.Where(n => n.Type == NodeType.CqrsCommand || n.Type == NodeType.CqrsQuery).ToList();

        foreach (var node in cqrsNodes)
        {
            var isQuery = node.Type == NodeType.CqrsQuery;
            var name = GetName(node);
            var returnType = node.Properties.ReturnType ?? "bool";
            var ext = node.Properties.GenerateFileExtension?.Trim() ?? ".g.cs";

            files.Add(new GeneratedFile {
               FileName = $"{name}.g.cs",
               RelativePath = isQuery ? "Queries" : "Commands",
               Content = cqrsTemplate.Render(new { 
                   project_name = projectName, 
                   folder = isQuery ? "Queries" : "Commands",
                   name = name, 
                   suffix = isQuery ? "Query" : "Command",
                   return_type = returnType,
                   generate_cs = ext.Equals(".cs", StringComparison.OrdinalIgnoreCase)
               }).TrimStart()
            });

            if (ext.Equals(".cs", StringComparison.OrdinalIgnoreCase))
            {
                files.Add(new GeneratedFile {
                   FileName = $"{name}.cs",
                   RelativePath = isQuery ? "Queries" : "Commands",
                   Content = partialStubCqrsTemplate.Render(new { 
                       project_name = projectName, 
                       folder = isQuery ? "Queries" : "Commands",
                       name = name, 
                       suffix = isQuery ? "Query" : "Command",
                       return_type = returnType 
                   }).TrimStart()
                });
            }
        }

        return files;
    }
}
