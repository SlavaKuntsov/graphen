using Graphen.Api.Exceptions;
using Graphen.Api.Services;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

var services = builder.Services;

services.AddProblemDetails();
services.AddExceptions();

services.AddControllers();
services.AddOpenApi();

services.AddSingleton<ITemplateService, TemplateService>();
services.AddTransient<ICodeGeneratorService, ScribanCodeGeneratorService>();
services.AddTransient<IProjectScaffoldService, DotnetCliScaffoldService>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();