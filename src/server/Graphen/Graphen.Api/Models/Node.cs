using System.Text.Json.Serialization;

namespace Graphen.Api.Models;

public class Node
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    
    // Тип ноды, например: "Controller", "Route", "CqrsCommand", "CqrsQuery", "Handler"
    public string Type { get; set; } = string.Empty;
    
    // Координаты для редактора (бэкенд их просто хранит, чтобы отдавать обратно)
    public Position Position { get; set; } = new();
    
    // Всякие метаданные: Имя контроллера, настройки параметров и т.д.
    public Dictionary<string, object> Properties { get; set; } = new();
}

public class Position
{
    public double X { get; set; }
    public double Y { get; set; }
}
