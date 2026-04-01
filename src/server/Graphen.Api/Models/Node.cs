using System.Text.Json.Serialization;

namespace Graphen.Api.Models;

[JsonConverter(typeof(JsonStringEnumConverter))]
public enum NodeType
{
    Controller,
    CqrsCommand,
    CqrsQuery,
    Action
}

public class Node
{
    public string Id { get; set; } = string.Empty;
    
    // Тип ноды, например: Controller, CqrsCommand, CqrsQuery, Action
    public NodeType Type { get; set; }
    
    // Координаты на холсте
    public Position Position { get; set; }
    
    // Строго типизированные метаданные ноды
    public NodeProperties Properties { get; set; } = new();
}

public class NodeProperties
{
    public string? ClassName { get; set; }
    public string? Description { get; set; }
    public string? Name { get; set; }
    public string? ReturnType { get; set; }
    public string? HttpVerb { get; set; }
    public string? MethodName { get; set; }
    public string? GenerateFileExtension { get; set; }
}

public struct Position
{
    public double X { get; set; }
    public double Y { get; set; }
}
