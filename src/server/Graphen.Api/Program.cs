using Graphen.Api.Exceptions;
using Graphen.Api.Services;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

var services = builder.Services;

services.AddProblemDetails();
services.AddExceptions();

services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
services.AddOpenApi();

services.AddSingleton<ITemplateService, TemplateService>();
services.AddTransient<ICodeGeneratorService, ScribanCodeGeneratorService>();
services.AddTransient<IProjectScaffoldService, DotnetCliScaffoldService>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();