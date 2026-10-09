import "@tanstack/start-client-core";

declare module "@tanstack/start-client-core" {
	interface ServerFnCtx<_TRegister, _TMethod, _TMiddlewares, _TInputValidator> {
		request: Request;
	}
}
