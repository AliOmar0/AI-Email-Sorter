import type { NextFunction, Request, Response } from "express";

type AsyncRoute = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown> | unknown;

// Named async boundary for route handlers. Express 5 catches rejected promises,
// but using this wrapper keeps route failures consistent and logs the route
// context before the central error handler maps the response.
export function asyncRoute(name: string, handler: AsyncRoute): AsyncRoute {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (err) {
      req.log.error({ err, route: name }, "route handler failed");
      next(err);
    }
  };
}
