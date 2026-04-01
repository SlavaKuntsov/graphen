using Graphen.Api.Exceptions.Middlewares;

namespace Graphen.Api.Exceptions;

public static class ExceptionsExtension
{
	public static IServiceCollection AddExceptions(this IServiceCollection services)
	{
		services.AddExceptionHandler<GlobalExceptionHandler>();

		return services;
	}
}