using Scriban;

namespace Graphen.Api.Services;

public interface ITemplateService
{
    Template GetTemplate(string templateName);
}
