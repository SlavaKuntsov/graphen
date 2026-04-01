namespace Graphen.Api.Models;

public class ProjectGraph
{
    public string ProjectName { get; set; } = string.Empty;
    
    /// <summary>
    /// Путь к целевой директории проекта. Если null — используется GeneratedOutput по умолчанию.
    /// </summary>
    public string? TargetPath { get; set; }
    
    public List<Node> Nodes { get; set; } = [];
    public List<Edge> Edges { get; set; } = [];
}
