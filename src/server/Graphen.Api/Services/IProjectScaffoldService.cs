namespace Graphen.Api.Services;

public interface IProjectScaffoldService
{
    /// <summary>
    /// Создать базовый .NET проект в указанной директории.
    /// </summary>
    Task ScaffoldAsync(string targetPath, string projectName, CancellationToken ct = default);
    
    /// <summary>
    /// Проверяет, нужен ли скаффолдинг (нет .sln или graphen.json).
    /// </summary>
    bool NeedsScaffold(string targetPath);
}
