using System.Diagnostics;

namespace Graphen.Api.Services;

public class DotnetCliScaffoldService(
    ILogger<DotnetCliScaffoldService> logger,
    ITemplateService templateService) : IProjectScaffoldService
{
    public bool NeedsScaffold(string targetPath)
    {
        if (!Directory.Exists(targetPath))
            return true;

        var hasSln = Directory.GetFiles(targetPath, "*.sln").Length > 0 || Directory.GetFiles(targetPath, "*.slnx").Length > 0;
        var hasGraphen = File.Exists(Path.Combine(targetPath, "graphen.json"));

        return !hasSln && !hasGraphen;
    }

    public async Task ScaffoldAsync(string targetPath, string projectName, CancellationToken ct = default)
    {
        Directory.CreateDirectory(targetPath);
        
        logger.LogInformation("Скаффолдинг нового проекта '{ProjectName}' в {Path}", projectName, targetPath);

        // 1. Создаём solution
        await RunDotnetAsync($"new sln -n {projectName} -o \"{targetPath}\" --format sln", ct);
        
        // 2. Создаём webapi проект
        var projectDir = Path.Combine(targetPath, projectName);
        await RunDotnetAsync($"new webapi -n {projectName} -o \"{projectDir}\" --no-https --use-controllers", ct);
        
        // 3. Добавляем проект в solution
        var slnPath = Path.Combine(targetPath, $"{projectName}.sln");
        var csprojPath = Path.Combine(projectDir, $"{projectName}.csproj");
        await RunDotnetAsync($"sln \"{slnPath}\" add \"{csprojPath}\"", ct);
        
        // 4. Добавляем MediatR и Scalar
        await RunDotnetAsync($"add \"{csprojPath}\" package MediatR", ct);
        await RunDotnetAsync($"add \"{csprojPath}\" package Scalar.AspNetCore", ct);
        
        // 5. Перезаписываем Program.cs нашим шаблоном
        var programTemplate = templateService.GetTemplate("Program");
        var programContent = programTemplate.Render(new { project_name = projectName });
        var programPath = Path.Combine(projectDir, "Program.cs");
        await File.WriteAllTextAsync(programPath, programContent.TrimStart(), ct);
        
        // 6. Удаляем сгенерированный по умолчанию WeatherForecast
        var weatherController = Path.Combine(projectDir, "Controllers", "WeatherForecastController.cs");
        if (File.Exists(weatherController)) File.Delete(weatherController);
        
        var weatherModel = Path.Combine(projectDir, "WeatherForecast.cs");
        if (File.Exists(weatherModel)) File.Delete(weatherModel);
        
        logger.LogInformation("Скаффолдинг завершён: {SlnPath}", slnPath);
    }

    private async Task RunDotnetAsync(string arguments, CancellationToken ct)
    {
        logger.LogInformation("dotnet {Arguments}", arguments);
        
        var psi = new ProcessStartInfo
        {
            FileName = "dotnet",
            Arguments = arguments,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };

        using var process = Process.Start(psi) 
            ?? throw new InvalidOperationException($"Не удалось запустить: dotnet {arguments}");
        
        var stdout = await process.StandardOutput.ReadToEndAsync(ct);
        var stderr = await process.StandardError.ReadToEndAsync(ct);
        
        await process.WaitForExitAsync(ct);

        if (process.ExitCode != 0)
        {
            logger.LogError("dotnet {Arguments} завершился с ошибкой: {Stderr}", arguments, stderr);
            throw new InvalidOperationException($"dotnet {arguments} failed (exit {process.ExitCode}): {stderr}");
        }
        
        if (!string.IsNullOrWhiteSpace(stdout))
            logger.LogDebug("dotnet output: {Stdout}", stdout.TrimEnd());
    }
}
