using Graphen.Api.Models;

namespace Graphen.Api.Services;

public interface ICodeGeneratorService
{
    List<GeneratedFile> GenerateProjectFiles(ProjectGraph graph, CancellationToken ct = default);
}
