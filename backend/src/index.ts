import { Container, DurableObject } from "cloudflare:workers";

interface Env {
  BACKEND: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.BACKEND.idFromName("backend");
    const stub = env.BACKEND.get(id);
    return stub.fetch(request);
  },
};

export class Backend extends DurableObject<Env> {
  private container: Container;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.container = ctx.container!;
  }

  async fetch(request: Request): Promise<Response> {
    await this.container.start();
    return this.container.fetch(request);
  }
}
