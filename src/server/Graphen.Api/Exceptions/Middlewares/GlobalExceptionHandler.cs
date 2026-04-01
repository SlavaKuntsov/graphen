using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;

namespace Graphen.Api.Exceptions.Middlewares;

public class GlobalExceptionHandler(IProblemDetailsService problemDetailsService) : IExceptionHandler
{
	private static readonly Dictionary<Type, (int StatusCode, string Title)> ExceptionMappings = new()
	{
		{ typeof(AlreadyExistsException), (StatusCodes.Status400BadRequest, "Ресурс уже существует") },
		{ typeof(BadRequestException), (StatusCodes.Status400BadRequest, "Некорректный запрос") },
		{ typeof(NotFoundException), (StatusCodes.Status404NotFound, "Ресурс не найден") },
		{ typeof(ValidationProblemException), (StatusCodes.Status400BadRequest, "Ошибка валидации") },
		{ typeof(UnauthorizedAccessException), (StatusCodes.Status401Unauthorized, "Не авторизован") },
		{ typeof(InvalidTokenException), (StatusCodes.Status400BadRequest, "Неверный токен") },
		{ typeof(ValidationException), (StatusCodes.Status400BadRequest, "Некорректные данные") },
		{ typeof(InvalidOperationException), (StatusCodes.Status400BadRequest, "Недопустимая операция") },
		{ typeof(UnprocessableContentException), (StatusCodes.Status422UnprocessableEntity, "Необрабатываемый контент") },
		{ typeof(ConflictException), (StatusCodes.Status409Conflict, "Конфликт") }
	};


	public async ValueTask<bool> TryHandleAsync(
		HttpContext httpContext,
		Exception exception,
		CancellationToken cancellationToken)
	{
		var (statusCode, title) = ExceptionMappings.TryGetValue(exception.GetType(), out var mapping)
			? mapping
			: (StatusCodes.Status500InternalServerError, "Внутренняя ошибка сервера");

		var activity = httpContext.Features.Get<IHttpActivityFeature>()?.Activity;

		httpContext.Response.StatusCode = statusCode;

		return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
		{
			HttpContext = httpContext,
			Exception = exception,
			ProblemDetails = new ProblemDetails
			{
				Status = statusCode,
				Title = title,
				Detail = exception.Message,
				Instance = $"{httpContext.Request.Method} {httpContext.Request.Path}",
				Extensions = new Dictionary<string, object?>
				{
					{ "requestId", httpContext.TraceIdentifier },
					{ "traceId", activity?.Id }
				}
			}
		});
	}
}