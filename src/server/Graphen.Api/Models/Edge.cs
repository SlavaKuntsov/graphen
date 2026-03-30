namespace Graphen.Api.Models;

public class Edge
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    
    // ID ноды из которой выходит стрелка
    public string SourceNodeId { get; set; } = string.Empty;
    
    // Pin/порт на исходящей ноде (например "output_1")
    public string SourceHandle { get; set; } = string.Empty;
    
    // ID ноды в которую входит стрелка
    public string TargetNodeId { get; set; } = string.Empty;
    
    // Pin/порт на входящей ноде
    public string TargetHandle { get; set; } = string.Empty;
}
