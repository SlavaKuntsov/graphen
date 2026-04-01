namespace Graphen.Api.Models;

public class GraphenProject
{
    public string Version { get; set; } = "1.0";
    public string ProjectName { get; set; } = string.Empty;
    public DateTime LastGenerated { get; set; }
    public ProjectGraph Graph { get; set; } = new();
}
