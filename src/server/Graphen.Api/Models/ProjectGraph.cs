namespace Graphen.Api.Models;

public class ProjectGraph
{
    public string ProjectName { get; set; } = string.Empty;
    public List<Node> Nodes { get; set; } = new();
    public List<Edge> Edges { get; set; } = new();
}
