using System.Collections.Concurrent;
using Scriban;

namespace Graphen.Api.Services;

public class TemplateService(IWebHostEnvironment env) : ITemplateService
{
    private readonly ConcurrentDictionary<string, Template> _cache = new();
    private readonly string _templatesDir = Path.Combine(env.ContentRootPath, "Templates");

    public Template GetTemplate(string templateName)
    {
        return _cache.GetOrAdd(templateName, name =>
        {
            var filePath = Path.Combine(_templatesDir, $"{name}.sbn");

            if (!File.Exists(filePath))
                throw new FileNotFoundException($"Шаблон '{name}.sbn' не найден в {_templatesDir}");

            var text = File.ReadAllText(filePath);
            var template = Template.Parse(text);

            if (template.HasErrors)
                throw new InvalidOperationException(
                    $"Ошибка парсинга шаблона '{name}.sbn': {string.Join(", ", template.Messages)}");

            return template;
        });
    }
}
